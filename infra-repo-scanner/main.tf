locals {
  name_prefix = "${var.project}-${var.environment}"
}

module "network" {
  source = "./modules/network"

  name_prefix = local.name_prefix
  vpc_cidr    = var.vpc_cidr
  az_count    = var.az_count
}

module "database" {
  source = "./modules/database"

  name_prefix = local.name_prefix
  vpc_id      = module.network.vpc_id
  vpc_cidr    = var.vpc_cidr
  # Todas las subredes: así activar/desactivar db_publicly_accessible no modifica el subnet group.
  subnet_ids = concat(module.network.private_subnet_ids, module.network.public_subnet_ids)

  db_name             = var.db_name
  db_username         = var.db_username
  db_schema           = var.db_schema
  engine_version      = var.db_engine_version
  instance_class      = var.db_instance_class
  allocated_storage   = var.db_allocated_storage
  multi_az            = var.db_multi_az
  deletion_protection = var.db_deletion_protection
  publicly_accessible = var.db_publicly_accessible
  admin_cidr          = var.db_admin_cidr
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

  db_host       = module.database.host
  db_port       = module.database.port
  db_name       = var.db_name
  db_schema     = var.db_schema
  db_secret_arn = module.database.secret_arn
}

module "frontend" {
  source = "./modules/frontend"

  name_prefix       = local.name_prefix
  dist_path         = var.frontend_dist_path
  api_origin_domain = module.backend.alb_dns_name
}
