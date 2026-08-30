#!/usr/bin/env bash
set -euo pipefail

# Aprovisiona Code Insight AI de cero (sirve tras un `terraform destroy`):
#   0. limpieza de secretos en cola de borrado   1. build del frontend
#   2. terraform init + apply                     3. build+push imagen backend
#   4. API key -> Secrets Manager                 5. carga de db/schema.sql en RDS
#   6. redespliegue de ECS (última task def)      7. variables de GitHub Actions
#   8. smoke test (health + POST/GET /api/v1/jobs)
#
# El esquema se carga con un `aws ecs run-task` puntual DENTRO de la VPC
# (reutiliza la task def del backend, cambiando el comando). La RDS no se
# expone a internet. Todos los `terraform apply` van con -auto-approve.
#
# Uso:
#   ANTHROPIC_API_KEY=sk-ant-... ./provision.sh
#   ./provision.sh                       # si la key ya está en ws-repo-scanner/.env
#
# Variables opcionales:
#   AWS_REGION (us-east-1)  PROJECT (repo-scanner)  ENVIRONMENT (dev)
#   GITHUB_REPO (narvaezlopez/repo-scanner)  ANTHROPIC_MODEL (claude-sonnet-5)
#   SKIP_GH=1              -> no toca las variables de GitHub
#   SKIP_DB_BOOTSTRAP=1    -> no carga db/schema.sql

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
SECRET_ANTHROPIC="${NAME_PREFIX}/anthropic-api-key"
SECRET_DB="${NAME_PREFIX}/database"
SCHEMA_FILE="$REPO_ROOT/ws-repo-scanner/db/schema.sql"

TF_VARS=(
  -var-file=environments/dev.tfvars
  -var "github_repo=${GITHUB_REPO}"
  -var "anthropic_model=${ANTHROPIC_MODEL}"
)

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33mWARN:\033[0m %s\n' "$1" >&2; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }
tf()   { terraform -chdir="$INFRA_DIR" output -raw "$1"; }
tf_apply() { terraform -chdir="$INFRA_DIR" apply -input=false -auto-approve "$@"; }

for bin in terraform aws docker node npm jq curl python3; do
  command -v "$bin" >/dev/null || die "falta '$bin' en el PATH"
done

# --- API key ---
if [[ -z "${ANTHROPIC_API_KEY:-}" && -f "$REPO_ROOT/ws-repo-scanner/.env" ]]; then
  ANTHROPIC_API_KEY="$(grep -E '^ANTHROPIC_API_KEY=' "$REPO_ROOT/ws-repo-scanner/.env" | head -1 | cut -d= -f2- || true)"
fi
[[ -n "${ANTHROPIC_API_KEY:-}" ]] || { read -rsp "ANTHROPIC_API_KEY: " ANTHROPIC_API_KEY; echo; }
[[ "${ANTHROPIC_API_KEY:-}" == sk-ant-* ]] || die "ANTHROPIC_API_KEY vacía o con formato inesperado"

aws sts get-caller-identity >/dev/null || die "credenciales AWS no válidas (aws configure)"

# Adoptar (no crear) el OIDC provider de GitHub SOLO si ya existe en la cuenta
# Y Terraform no lo está gestionando ya. Si está en el state, pasar "false" haría
# que Terraform lo destruyera.
if aws iam list-open-id-connect-providers \
     --query "OpenIDConnectProviderList[?ends_with(Arn, ':oidc-provider/token.actions.githubusercontent.com')]" \
     --output text 2>/dev/null | grep -q . \
   && ! terraform -chdir="$INFRA_DIR" state list 2>/dev/null \
        | grep -q 'aws_iam_openid_connect_provider.github'; then
  TF_VARS+=(-var "create_github_oidc_provider=false")
fi

# --- 0. secretos en cola de borrado (bloquean el CreateSecret del apply) ---
step "Comprobando secretos pendientes de borrado"
for s in "$SECRET_ANTHROPIC" "$SECRET_DB"; do
  dd="$(aws secretsmanager describe-secret --secret-id "$s" --region "$AWS_REGION" \
        --query 'DeletedDate' --output text 2>/dev/null || echo MISSING)"
  if [[ "$dd" != "None" && "$dd" != "MISSING" ]]; then
    echo "  purgando $s"
    aws secretsmanager delete-secret --secret-id "$s" \
      --force-delete-without-recovery --region "$AWS_REGION" >/dev/null
  fi
done

# --- 1. build frontend ---
step "Build del frontend (Angular)"
( cd "$REPO_ROOT/web-ui-repo-scanner" && npm ci --silent && npm run build )

# --- 2. terraform init + apply ---
step "terraform init + apply"
terraform -chdir="$INFRA_DIR" init -input=false -upgrade
tf_apply "${TF_VARS[@]}"

ECR_URL="$(tf backend_ecr_repository_url)"
ALB_URL="$(tf backend_alb_dns_name)"

# --- 3. build + push imagen backend (arm64 = Fargate) ---
step "Build + push de la imagen backend a ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ECR_URL%%/*}"
docker build --platform linux/arm64 -t "${ECR_URL}:latest" "$REPO_ROOT/ws-repo-scanner"
docker push "${ECR_URL}:latest"

# --- 4. API key -> Secrets Manager ---
step "Guardando la API key en Secrets Manager ($SECRET_ANTHROPIC)"
aws secretsmanager put-secret-value \
  --secret-id "$SECRET_ANTHROPIC" --secret-string "$ANTHROPIC_API_KEY" \
  --region "$AWS_REGION" >/dev/null

# --- 5. carga de db/schema.sql en RDS (ECS run-task dentro de la VPC) ---
if [[ "${SKIP_DB_BOOTSTRAP:-}" == "1" ]]; then
  step "Carga del esquema: omitida (SKIP_DB_BOOTSTRAP=1)"
else
  step "Cargando $SCHEMA_FILE en RDS (ECS run-task)"
  NETCFG="$(aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" \
           --region "$AWS_REGION" --query 'services[0].networkConfiguration.awsvpcConfiguration' --output json)"
  SUBNETS="$(jq -r '.subnets | join(",")' <<<"$NETCFG")"
  SGS="$(jq -r '.securityGroups | join(",")' <<<"$NETCFG")"
  SQL="$(cat "$SCHEMA_FILE")"
  # La task del backend ya trae DB_HOST/PORT/NAME por env y DB_USER/PASSWORD por secreto;
  # solo se cambia el comando por un node -e que usa el cliente pg incluido en la imagen.
  NODE_SCRIPT='const{Client}=require("pg");const c=new Client({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:{rejectUnauthorized:false}});c.connect().then(()=>c.query(process.env.SCHEMA_SQL)).then(()=>console.log("SCHEMA LOADED OK")).then(()=>c.end()).catch(e=>{console.error(e.message);process.exit(1)});'
  OVERRIDES="$(jq -nc --arg s "$NODE_SCRIPT" --arg sql "$SQL" \
    '{containerOverrides:[{name:"api",command:["node","-e",$s],environment:[{name:"SCHEMA_SQL",value:$sql}]}]}')"

  TASK_ARN="$(aws ecs run-task --cluster "$ECS_CLUSTER" --task-definition "$NAME_PREFIX" \
    --launch-type FARGATE --region "$AWS_REGION" \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SGS],assignPublicIp=DISABLED}" \
    --overrides "$OVERRIDES" --query 'tasks[0].taskArn' --output text)"
  [[ -n "$TASK_ARN" && "$TASK_ARN" != "None" ]] || die "no se pudo lanzar la task de carga"

  aws ecs wait tasks-stopped --cluster "$ECS_CLUSTER" --tasks "$TASK_ARN" --region "$AWS_REGION"
  EXIT="$(aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$TASK_ARN" --region "$AWS_REGION" \
          --query 'tasks[0].containers[0].exitCode' --output text)"
  if [[ "$EXIT" != "0" ]]; then
    aws logs get-log-events --log-group-name "/ecs/${NAME_PREFIX}" \
      --log-stream-name "api/api/$(basename "$TASK_ARN")" --region "$AWS_REGION" \
      --query 'events[].message' --output text 2>/dev/null | tail -20 >&2
    die "la carga del esquema falló (exit $EXIT)"
  fi
  echo "  esquema cargado"
fi

# --- 6. redespliegue de ECS con la última task definition ---
step "Redespliegue de ECS (última revisión) y espera a que estabilice"
aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" \
  --task-definition "$NAME_PREFIX" --force-new-deployment --region "$AWS_REGION" >/dev/null
aws ecs wait services-stable --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" --region "$AWS_REGION"

# --- 7. variables de GitHub Actions ---
if [[ "${SKIP_GH:-}" != "1" ]] && command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  step "Actualizando variables de GitHub Actions ($GITHUB_REPO)"
  gh variable set AWS_DEPLOY_ROLE_ARN        -R "$GITHUB_REPO" -b "$(tf cicd_deploy_role_arn)"
  gh variable set FRONTEND_BUCKET            -R "$GITHUB_REPO" -b "$(tf frontend_bucket)"
  gh variable set CLOUDFRONT_DISTRIBUTION_ID -R "$GITHUB_REPO" -b "$(tf frontend_cloudfront_distribution_id)"
else
  step "GitHub Actions: omitido (SKIP_GH=1, o 'gh' no instalado / sin login)"
fi

# --- 8. smoke test ---
step "Smoke test"
curl -fsS -m 15 "http://${ALB_URL}/health" && echo

ZIP="$(mktemp -d)/smoke.zip"
python3 - "$ZIP" <<'PY'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1], "w")
z.writestr("package.json", '{"name":"smoke","dependencies":{"express":"^4"}}')
z.writestr("src/index.js", "console.log('hi')")
z.close()
PY

code="$(curl -s -o /tmp/smoke_job.json -w '%{http_code}' -m 30 -F "repo=@${ZIP}" "http://${ALB_URL}/api/v1/jobs")"
if [[ "$code" == 202 ]]; then
  JID="$(jq -r .jobId /tmp/smoke_job.json)"
  echo "  POST /api/v1/jobs -> 202 ($JID)"
  curl -fsS -m 15 "http://${ALB_URL}/api/v1/jobs/${JID}" && echo
else
  warn "POST /api/v1/jobs -> $code  (¿esquema sin cargar? revisa: aws logs tail /ecs/${NAME_PREFIX})"
fi

printf '\n\033[1;32mListo.\033[0m\n'
echo "  API:      http://${ALB_URL}"
echo "  Frontend: $(tf frontend_url)"
