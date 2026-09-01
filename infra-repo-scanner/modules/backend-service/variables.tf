variable "name_prefix" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "health_check_path" {
  type    = string
  default = "/health"
}

variable "cpu_architecture" {
  description = "ARM64 (Graviton) o X86_64. Debe coincidir con la arquitectura de la imagen."
  type        = string
  default     = "ARM64"
}

variable "anthropic_model" {
  description = "ID del modelo Claude en la API de Anthropic."
  type        = string
  default     = "claude-sonnet-5"
}

variable "db_host" {
  type = string
}

variable "db_port" {
  type = number
}

variable "db_name" {
  type = string
}

variable "db_schema" {
  type = string
}

variable "db_secret_arn" {
  description = "Secreto con las credenciales de la DB (JSON: username, password, ...)"
  type        = string
}

variable "auth_enabled" {
  description = "Exigir token de Firebase en /api/v1/jobs y /ws"
  type        = bool
  default     = false
}
