locals {
  name_prefix = "${var.project}-${var.environment}"
}

module "network" {
  source = "./modules/network"

  name_prefix = local.name_prefix
  vpc_cidr    = var.vpc_cidr
  az_count    = var.az_count
}

module "backend" {
  source = "./modules/backend-service"

  name_prefix        = local.name_prefix
  aws_region         = var.aws_region
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  private_subnet_ids = module.network.private_subnet_ids

  container_port   = var.backend_container_port
  image_tag        = var.backend_image_tag
  desired_count    = var.backend_desired_count
  cpu              = var.backend_cpu
  memory           = var.backend_memory
  cpu_architecture = var.backend_cpu_architecture
  anthropic_model  = var.anthropic_model
}

module "frontend" {
  source = "./modules/frontend"

  name_prefix = local.name_prefix
  dist_path   = var.frontend_dist_path
}
