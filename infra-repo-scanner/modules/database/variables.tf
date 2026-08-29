variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  description = "CIDR de la VPC, para permitir Postgres desde dentro"
  type        = string
}

variable "subnet_ids" {
  description = "Subredes del subnet group (pasar todas: privadas + públicas)"
  type        = list(string)
}

variable "db_name" {
  type    = string
  default = "repo_scanner"
}

variable "db_username" {
  type    = string
  default = "repo_scanner_app"
}

variable "db_schema" {
  description = "Solo se guarda en el secreto; el proyecto no crea el esquema"
  type        = string
  default     = "sch_repo_scanner"
}

variable "engine_version" {
  type    = string
  default = "16"
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "max_allocated_storage" {
  type    = number
  default = 100
}

variable "backup_retention_days" {
  type    = number
  default = 1
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "deletion_protection" {
  type    = bool
  default = false
}

variable "publicly_accessible" {
  description = "Solo para cargar db/schema.sql desde fuera; dejar en false salvo bootstrap"
  type        = bool
  default     = false
}

variable "admin_cidr" {
  description = "CIDR extra con acceso a 5432 (tu IP durante el bootstrap). Vacío = sin regla extra"
  type        = string
  default     = ""
}
