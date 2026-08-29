project     = "repo-scanner"
environment = "dev"
aws_region  = "us-east-1"

backend_desired_count = 1
backend_cpu           = 256
backend_memory        = 512

db_instance_class    = "db.t4g.micro"
db_allocated_storage = 20
db_multi_az          = false
