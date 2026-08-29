#!/usr/bin/env bash
set -euo pipefail

# Aprovisiona la infra de Code Insight AI de cero a funcionando:
#   1. build del frontend        2. terraform apply
#   3. build+push imagen backend  4. API key -> Secrets Manager
#   5. redespliegue de ECS        6. variables de GitHub Actions
#   7. smoke test
#
# Uso:
#   ANTHROPIC_API_KEY=sk-ant-... ./provision.sh
# o con la key ya en ws-repo-scanner/.env:
#   ./provision.sh
#
# Variables opcionales:
#   AWS_REGION (us-east-1)  PROJECT (repo-scanner)  ENVIRONMENT (dev)
#   GITHUB_REPO (narvaezlopez/repo-scanner)  ANTHROPIC_MODEL (claude-sonnet-5)
#   SKIP_GH=1   -> no toca las variables de GitHub

AWS_REGION="${AWS_REGION:-us-east-1}"
PROJECT="${PROJECT:-repo-scanner}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
GITHUB_REPO="${GITHUB_REPO:-narvaezlopez/repo-scanner}"
ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-sonnet-5}"

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$INFRA_DIR/.." && pwd)"
NAME_PREFIX="${PROJECT}-${ENVIRONMENT}"
ECS_CLUSTER="${NAME_PREFIX}-cluster"
ECS_SERVICE="${NAME_PREFIX}-svc"
SECRET_ID="${NAME_PREFIX}/anthropic-api-key"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

for bin in terraform aws docker node npm; do
  command -v "$bin" >/dev/null || die "falta '$bin' en el PATH"
done

# --- API key ---
if [[ -z "${ANTHROPIC_API_KEY:-}" && -f "$REPO_ROOT/ws-repo-scanner/.env" ]]; then
  ANTHROPIC_API_KEY="$(grep -E '^ANTHROPIC_API_KEY=' "$REPO_ROOT/ws-repo-scanner/.env" | head -1 | cut -d= -f2- || true)"
fi
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  read -rsp "ANTHROPIC_API_KEY: " ANTHROPIC_API_KEY; echo
fi
[[ "${ANTHROPIC_API_KEY:-}" == sk-ant-* ]] || die "ANTHROPIC_API_KEY vacía o con formato inesperado"

aws sts get-caller-identity >/dev/null || die "credenciales AWS no válidas (aws configure)"

# --- 1. build frontend ---
step "Build del frontend (Angular)"
( cd "$REPO_ROOT/web-ui-repo-scanner" && npm ci --silent && npm run build )

# --- 2. terraform apply ---
step "terraform init + apply"
terraform -chdir="$INFRA_DIR" init -input=false -upgrade
terraform -chdir="$INFRA_DIR" apply \
  -var-file=environments/dev.tfvars \
  -var "github_repo=${GITHUB_REPO}" \
  -var "anthropic_model=${ANTHROPIC_MODEL}"

tf() { terraform -chdir="$INFRA_DIR" output -raw "$1"; }
ECR_URL="$(tf backend_ecr_repository_url)"
ALB_URL="$(tf backend_alb_dns_name)"

# --- 3. build + push imagen backend (arm64, = Fargate) ---
step "Build + push de la imagen backend a ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ECR_URL%%/*}"
docker build --platform linux/arm64 -t "${ECR_URL}:latest" "$REPO_ROOT/ws-repo-scanner"
docker push "${ECR_URL}:latest"

# --- 4. API key -> Secrets Manager ---
step "Guardando la API key en Secrets Manager ($SECRET_ID)"
aws secretsmanager put-secret-value \
  --secret-id "$SECRET_ID" \
  --secret-string "$ANTHROPIC_API_KEY" \
  --region "$AWS_REGION" >/dev/null

# --- 5. redespliegue de ECS ---
step "Forzando redespliegue de ECS y esperando a que estabilice"
aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" \
  --force-new-deployment --region "$AWS_REGION" >/dev/null
aws ecs wait services-stable --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" --region "$AWS_REGION"

# --- 6. variables de GitHub Actions ---
if [[ "${SKIP_GH:-}" != "1" ]] && command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  step "Actualizando variables de GitHub Actions ($GITHUB_REPO)"
  gh variable set AWS_DEPLOY_ROLE_ARN        -R "$GITHUB_REPO" -b "$(tf cicd_deploy_role_arn)"
  gh variable set FRONTEND_BUCKET            -R "$GITHUB_REPO" -b "$(tf frontend_bucket)"
  gh variable set CLOUDFRONT_DISTRIBUTION_ID -R "$GITHUB_REPO" -b "$(tf frontend_cloudfront_distribution_id)"
else
  step "GitHub Actions: omitido (SKIP_GH=1, o 'gh' no instalado / sin login)"
fi

# --- 7. smoke test ---
step "Smoke test"
curl -fsS -m 15 "http://${ALB_URL}/health" && echo
curl -fsS -m 40 -X POST "http://${ALB_URL}/api/v1/llm/complete" \
  -H 'content-type: application/json' \
  -d '{"prompt":"Responde solo: ok"}' && echo

printf '\n\033[1;32mListo.\033[0m\n'
echo "  API:      http://${ALB_URL}"
echo "  Frontend: $(tf frontend_url)"
