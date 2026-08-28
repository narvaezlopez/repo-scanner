# Estado remoto. Para la primera pasada puedes dejarlo comentado y usar estado
# local. Cuando exista el bucket, descoméntalo y ejecuta:
#   terraform init -migrate-state
#
# terraform {
#   backend "s3" {
#     bucket       = "repo-scanner-tfstate-<sufijo-unico>"
#     key          = "dev/terraform.tfstate"
#     region       = "us-east-1"
#     encrypt      = true
#     use_lockfile = true
#   }
# }
