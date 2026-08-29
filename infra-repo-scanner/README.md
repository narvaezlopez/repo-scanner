# infra-repo-scanner

Infraestructura AWS (Terraform) para desplegar **Code Insight AI**.
Alcance actual: frontend + backend + base de datos desplegables. Nada de SQS ni DynamoDB todavía.

## Qué crea

| Módulo | Recursos |
|---|---|
| `network` | VPC, 2 subredes públicas + 2 privadas, IGW, 1 NAT Gateway, route tables |
| `database` | RDS PostgreSQL 16 (`db.t4g.micro`, gp3 20→100 GiB, cifrado) en subredes privadas, subnet group, security group (5432 desde la VPC), `random_password` guardado en Secrets Manager (`repo-scanner-dev/database`, JSON) |
| `backend-service` | ECR, cluster ECS, servicio Fargate, ALB + target group (`/health`), security groups, log group, roles IAM, secretos en Secrets Manager (`ANTHROPIC_API_KEY` + credenciales de la DB) cableados al contenedor |
| `frontend` | Bucket S3 privado, CloudFront + Origin Access Control, política de bucket, subida del build de Angular |

## Base de datos

RDS no es público. Terraform genera la contraseña y la deja en el secreto
`repo-scanner-dev/database` como JSON (`username`, `password`, `host`, `port`,
`dbname`, `schema`). El contenedor recibe `DB_HOST/DB_PORT/DB_NAME/DB_SCHEMA`
como env y `DB_USER/DB_PASSWORD` desde ese secreto. El proyecto **no crea el
esquema**: hay que cargar `../ws-repo-scanner/db/schema.sql` una vez.

Bootstrap del esquema (abrir → cargar → cerrar):

```bash
MYIP=$(curl -s https://checkip.amazonaws.com)
terraform apply -var-file=environments/dev.tfvars \
  -var "db_publicly_accessible=true" -var "db_admin_cidr=${MYIP}/32"

read HOST PORT USER PASS DB < <(aws secretsmanager get-secret-value \
  --secret-id repo-scanner-dev/database --query SecretString --output text \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["host"],d["port"],d["username"],d["password"],d["dbname"])')

PGPASSWORD="$PASS" psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -f ../ws-repo-scanner/db/schema.sql

terraform apply -var-file=environments/dev.tfvars   # vuelve a cerrar la DB
```

## LLM

El backend llama a Claude vía la **API de Anthropic**. El `apply` crea el secreto
`repo-scanner-dev/anthropic-api-key` (vacío) y lo cablea al contenedor. El valor
de la API key **no** se gestiona en Terraform (no acaba en el state); ponlo
aparte tras el primer `apply`:

```bash
aws secretsmanager put-secret-value \
  --secret-id repo-scanner-dev/anthropic-api-key \
  --secret-string 'sk-ant-...' --region us-east-1
# y refresca el servicio para que la tarea recoja el valor
aws ecs update-service --cluster repo-scanner-dev-cluster \
  --service repo-scanner-dev-svc --force-new-deployment --region us-east-1
```

```
Internet ──► CloudFront ──► S3 (SPA, privado)
Internet ──► ALB (HTTP:80) ──► ECS Fargate (API :3000, subredes privadas) ──► NAT ──► Internet
                                     │
                                     └──► RDS PostgreSQL (subredes privadas, :5432)
```

## Requisitos

- Terraform ≥ 1.9
- Credenciales AWS con permisos suficientes (`aws configure` o variables de entorno)
- Imagen de la API publicada en ECR (ver más abajo)
- Build de Angular generado: `cd ../web-ui-repo-scanner && npm run build`

## Uso

De cero a funcionando (build front + apply + push imagen + secreto + redeploy +
variables de GitHub + smoke test):

```bash
cd infra-repo-scanner
ANTHROPIC_API_KEY=sk-ant-... ./provision.sh
```

(si la key ya está en `../ws-repo-scanner/.env`, basta `./provision.sh`)

### Manual

```bash
cd infra-repo-scanner
terraform init
terraform apply -var-file=environments/dev.tfvars
```

En la primera pasada el servicio ECS quedará sin tareas sanas hasta que exista
una imagen. Flujo recomendado:

```bash
# 1. crear sólo el repositorio ECR
terraform apply -target=module.backend.aws_ecr_repository.this -var-file=environments/dev.tfvars

# 2. construir y publicar la imagen
ECR_URL=$(terraform output -raw backend_ecr_repository_url)
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin "${ECR_URL%/*}"
docker build -t "$ECR_URL:latest" ../ws-repo-scanner
docker push "$ECR_URL:latest"

# 3. aplicar el resto
terraform apply -var-file=environments/dev.tfvars
```

Salidas útiles:

```bash
terraform output backend_alb_dns_name   # http://...  -> probar /health
terraform output frontend_url           # https://...cloudfront.net
```

Tras subir una versión nueva de la SPA, invalida la caché:

```bash
aws cloudfront create-invalidation \
  --distribution-id "$(terraform output -raw frontend_cloudfront_distribution_id)" \
  --paths '/*'
```

## CI/CD con GitHub Actions

El workflow [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) hace,
en cada push a `main`: build+push de la imagen a ECR + `force-new-deployment` del
servicio ECS, y build de Angular + `s3 sync` + invalidación de CloudFront.
Autentica con **OIDC** (sin claves estáticas).

Configuración única:

```bash
# 1. crear el rol de despliegue (necesita la infra ya aplicada)
terraform apply -var-file=environments/dev.tfvars -var 'github_repo=narvaezlopez/repo-scanner'
#    si el OIDC provider de GitHub ya existe en la cuenta, añade:
#    -var 'create_github_oidc_provider=false'

# 2. registrar las variables en el repo de GitHub
gh variable set AWS_DEPLOY_ROLE_ARN        -b "$(terraform output -raw cicd_deploy_role_arn)"
gh variable set FRONTEND_BUCKET            -b "$(terraform output -raw frontend_bucket)"
gh variable set CLOUDFRONT_DISTRIBUTION_ID -b "$(terraform output -raw frontend_cloudfront_distribution_id)"
```

(sin `gh`: Settings → Secrets and variables → Actions → Variables)

## Estado remoto

`backend.tf` trae la config de backend S3 comentada. Para la kata puedes trabajar
con estado local; cuando quieras estado remoto, crea el bucket, descomenta el
bloque y ejecuta `terraform init -migrate-state`.

## Limitaciones conscientes (siguiente iteración)

- ALB sólo HTTP. HTTPS necesita dominio + certificado ACM.
- 1 sola tarea ECS, 1 NAT y RDS single-AZ: barato, no HA.
- Carga del esquema manual (abrir/cerrar la DB); en real sería un job en la VPC o un bastion.
- Sin WAF, sin VPC endpoints, sin autoscaling.
- El `terraform apply` sube la SPA; en un pipeline real sería `aws s3 sync` + invalidación.
