variable "name_prefix" {
  type = string
}

variable "dist_path" {
  description = "Ruta local a la carpeta browser/ del build de Angular"
  type        = string
}

variable "api_origin_domain" {
  description = "DNS del ALB de la API. CloudFront enruta /api/* y /ws hacia aquí."
  type        = string
}
