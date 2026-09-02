# infra-repo-scanner

Infraestructura AWS (Terraform) para desplegar **Code Insight AI**.
Alcance actual: frontend + backend + base de datos desplegables. Nada de SQS ni DynamoDB todavía.

## Qué crea

| Módulo | Recursos |
|---|---|
| `network` | VPC, 2 subredes públicas + 2 privadas, IGW, 1 NAT Gateway, route tables |
| `database` | RDS PostgreSQL 16 (`db.t4g.micro`, gp3 20→100 GiB, cifrado) en subredes privadas, subnet group, security group (5432 desde la VPC), `random_password` guardado en Secrets Manager (`repo-scanner-dev/database`, JSON) |
| `backend-service` | ECR, cluster ECS, servicio Fargate, ALB + target group (`/health`), security groups, log group, roles IAM, secretos en Secrets Manager (`ANTHROPIC_API_KEY`, credenciales de la DB y `firebase-service-account`) cableados al contenedor, variable `AUTH_ENABLED` |
| `frontend` | Bucket S3 privado, CloudFront (orígenes S3 + ALB; `/api/*` y `/ws` van al ALB), Origin Access Control, política de bucket, subida del build de Angular |

## Base de datos

RDS **no es público** (subredes privadas, `rds.force_ssl` activo). Terraform
genera la contraseña y la deja en el secreto `repo-scanner-dev/database` como
JSON (`username`, `password`, `host`, `port`, `dbname`, `schema`). El contenedor
recibe `DB_HOST/DB_PORT/DB_NAME/DB_SCHEMA/DB_SSL` como env y `DB_USER/DB_PASSWORD`
desde ese secreto. El proyecto **no crea el esquema**: hay que cargar
`../ws-repo-scanner/db/schema.sql` una vez.

`provision.sh` lo hace en su paso 5 con un `aws ecs run-task` puntual dentro de
la VPC (reutiliza la task def del backend, cambia el comando por un `node -e`
que ejecuta el SQL con el cliente `pg` de la imagen). A mano:

```bash
NETCFG=$(aws ecs describe-services --cluster repo-scanner-dev-cluster \
  --services repo-scanner-dev-svc --query 'services[0].networkConfiguration.awsvpcConfiguration' --output json)
SUBNETS=$(jq -r '.subnets|join(",")' <<<"$NETCFG"); SGS=$(jq -r '.securityGroups|join(",")' <<<"$NETCFG")
SQL=$(cat ../ws-repo-scanner/db/schema.sql)
NODE='const{Client}=require("pg");const c=new Client({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:{rejectUnauthorized:false}});c.connect().then(()=>c.query(process.env.SCHEMA_SQL)).then(()=>console.log("OK")).then(()=>c.end()).catch(e=>{console.error(e.message);process.exit(1)});'
OV=$(jq -nc --arg s "$NODE" --arg sql "$SQL" '{containerOverrides:[{name:"api",command:["node","-e",$s],environment:[{name:"SCHEMA_SQL",value:$sql}]}]}')
aws ecs run-task --cluster repo-scanner-dev-cluster --task-definition repo-scanner-dev \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SGS],assignPublicIp=DISABLED}" \
  --overrides "$OV"
# logs: aws logs tail /ecs/repo-scanner-dev --since 5m   -> "SCHEMA LOADED OK"
```

Las variables `db_publicly_accessible` / `db_admin_cidr` siguen existiendo por si
alguna vez hace falta abrirla, pero el endpoint público **no es alcanzable**
mientras la instancia esté en subred privada; el `run-task` es la vía real.

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
Internet ──► CloudFront ─┬─► S3 (SPA, privado)            [/*]
                         └─► ALB (HTTP:80) ──► ECS Fargate [/api/*, /ws]
                                                  │
                                                  ├─► NAT ──► Internet (LLM, ECR)
                                                  └─► RDS PostgreSQL (subredes privadas, :5432)
```

CloudFront tiene dos orígenes: S3 para la SPA y el ALB para `/api/*` y `/ws`. Así
el navegador solo habla con el dominio de CloudFront → **mismo origen, sin CORS**
y sin la URL del backend embebida en la SPA (build de prod usa `apiBaseUrl: ''`).

## Requisitos

- Terraform ≥ 1.9
- Credenciales AWS con permisos suficientes (`aws configure` o variables de entorno)
- Imagen de la API publicada en ECR (ver más abajo)
- Build de Angular generado: `cd ../web-ui-repo-scanner && npm run build`

## Uso

De cero a funcionando, también tras un `terraform destroy`. `provision.sh` hace,
en orden: purga de secretos en cola de borrado → build del front → `terraform
apply` → build+push de la imagen → API key a Secrets Manager → **carga de
`db/schema.sql` en RDS** (vía `aws ecs run-task` en la VPC) → redespliegue de ECS
a la última task definition → variables de GitHub → smoke test (`/health` +
`POST`/`GET /api/v1/jobs`).

```bash
cd infra-repo-scanner
ANTHROPIC_API_KEY=sk-ant-... ./provision.sh
```

(si la key ya está en `../ws-repo-scanner/.env`, basta `./provision.sh`)

Flags: `SKIP_DB_BOOTSTRAP=1` (no carga `db/schema.sql`), `SKIP_GH=1` (no toca las
variables de GitHub). Todos los `terraform apply` van con `-auto-approve`.
Requiere `terraform`, `aws`, `docker`, `node`, `npm`, `jq`, `curl`, `python3`.

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
