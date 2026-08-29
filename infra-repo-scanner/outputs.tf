output "backend_alb_dns_name" {
  description = "URL pública (HTTP) del ALB de la API"
  value       = "http://${module.backend.alb_dns_name}"
}

output "backend_ecr_repository_url" {
  description = "Repositorio ECR donde publicar la imagen de la API"
  value       = module.backend.ecr_repository_url
}

output "backend_ecs_cluster" {
  description = "Nombre del cluster ECS"
  value       = module.backend.ecs_cluster_name
}

output "backend_ecs_service" {
  description = "Nombre del servicio ECS"
  value       = module.backend.ecs_service_name
}

output "database_endpoint" {
  description = "host:port de la instancia RDS (accesible solo desde la VPC)"
  value       = module.database.endpoint
}

output "database_name" {
  description = "Nombre de la base de datos"
  value       = module.database.db_name
}

output "database_secret_arn" {
  description = "Secreto de Secrets Manager con las credenciales de la DB"
  value       = module.database.secret_arn
}

output "frontend_bucket" {
  description = "Bucket S3 que sirve la SPA"
  value       = module.frontend.bucket_name
}

output "frontend_url" {
  description = "URL pública de CloudFront"
  value       = "https://${module.frontend.cloudfront_domain_name}"
}

output "frontend_cloudfront_distribution_id" {
  description = "ID de la distribución (para invalidaciones)"
  value       = module.frontend.cloudfront_distribution_id
}
