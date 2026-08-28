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

# --- frontend (S3 + CloudFront) ---
variable "frontend_dist_path" {
  description = "Ruta local al build de Angular (carpeta browser/) para subir a S3"
  type        = string
  default     = "../web-ui-repo-scanner/dist/web-ui-repo-scanner/browser"
}
