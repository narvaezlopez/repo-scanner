# Estado local por defecto. Para estado remoto, crear el bucket y descomentar:
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
