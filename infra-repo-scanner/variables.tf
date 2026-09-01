variable "project" {
  description = "Prefijo de nombres y tag Project"
  type        = string
  default     = "repo-scanner"
}

variable "environment" {
  description = "Entorno lógico (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "Región AWS de despliegue"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR de la VPC"
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "Número de zonas de disponibilidad a usar"
  type        = number
  default     = 2
}

# --- backend (ECS Fargate + ALB) ---
variable "backend_container_port" {
  description = "Puerto que expone el contenedor de la API"
  type        = number
  default     = 3000
}

variable "backend_image_tag" {
  description = "Tag de la imagen en ECR a desplegar"
  type        = string
  default     = "latest"
}

variable "backend_desired_count" {
  description = "Número de tareas ECS del servicio"
  type        = number
  default     = 1
}

variable "backend_cpu" {
  description = "CPU de la tarea Fargate (unidades)"
  type        = number
  default     = 256
}

variable "backend_memory" {
  description = "Memoria de la tarea Fargate (MiB)"
  type        = number
  default     = 512
}

variable "backend_cpu_architecture" {
  description = "ARM64 (Graviton, build nativo en Apple Silicon) o X86_64"
  type        = string
  default     = "ARM64"
}

variable "anthropic_model" {
  description = "ID del modelo Claude. Menor coste: claude-sonnet-5; máxima capacidad: claude-opus-5"
  type        = string
  default     = "claude-sonnet-5"
}

variable "auth_enabled" {
  description = "Exigir token de Firebase en el backend (activar cuando el frontend ya lo envíe)"
  type        = bool
  default     = false
}

# --- base de datos (RDS PostgreSQL) ---
variable "db_name" {
  description = "Nombre de la base de datos"
  type        = string
  default     = "repo_scanner"
}

variable "db_username" {
  description = "Usuario maestro de la base de datos"
  type        = string
  default     = "repo_scanner_app"
}

variable "db_schema" {
  description = "Esquema donde vive el modelo (db/schema.sql). El proyecto no lo crea"
  type        = string
  default     = "sch_repo_scanner"
}

variable "db_engine_version" {
  description = "Versión del engine Postgres (major o major.minor)"
  type        = string
  default     = "16"
}

variable "db_instance_class" {
  description = "Clase de instancia RDS"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "GiB iniciales (autoescala hasta 100)"
  type        = number
  default     = 20
}

variable "db_multi_az" {
  description = "Alta disponibilidad (encarece x2). Off en dev"
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "Impedir el borrado de la instancia"
  type        = bool
  default     = false
}

variable "db_publicly_accessible" {
  description = "Abrir la DB a internet SOLO para cargar db/schema.sql; revertir después"
  type        = bool
  default     = false
}

variable "db_admin_cidr" {
  description = "CIDR con acceso temporal a 5432 durante el bootstrap (p.ej. TU_IP/32)"
  type        = string
  default     = ""
}

# --- frontend (S3 + CloudFront) ---
variable "frontend_dist_path" {
  description = "Ruta local al build de Angular (carpeta browser/) para subir a S3"
  type        = string
  default     = "../web-ui-repo-scanner/dist/web-ui-repo-scanner/browser"
}
