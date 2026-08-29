output "endpoint" {
  description = "host:port de la instancia"
  value       = aws_db_instance.this.endpoint
}

output "host" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "db_name" {
  value = aws_db_instance.this.db_name
}

output "secret_arn" {
  description = "Secreto con las credenciales (JSON: username, password, host, port, dbname, schema)"
  value       = aws_secretsmanager_secret.db.arn
}

output "security_group_id" {
  value = aws_security_group.db.id
}
