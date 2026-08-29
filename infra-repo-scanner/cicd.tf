# Rol OIDC para GitHub Actions. Se crea sólo si se define github_repo.

variable "github_repo" {
  description = "owner/repo de GitHub habilitado para desplegar (p.ej. narvaezlopez/repo-scanner). Vacío = no crear rol CI."
  type        = string
  default     = ""
}

variable "create_github_oidc_provider" {
  description = "Crear el OIDC provider de GitHub. Ponlo en false si ya existe en la cuenta."
  type        = bool
  default     = true
}

variable "github_sub_claims" {
  description = "Patrones StringLike para el claim `sub` del token OIDC. Vacío = deriva de github_repo y acepta tanto el formato clásico (repo:owner/name:*) como el de IDs inmutables (repo:owner@ID/name@ID:*)."
  type        = list(string)
  default     = []
}

data "aws_caller_identity" "current" {}

locals {
  cicd_enabled = var.github_repo != ""
  gh_oidc_host = "token.actions.githubusercontent.com"
  gh_oidc_arn  = var.create_github_oidc_provider && local.cicd_enabled ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${local.gh_oidc_host}"

  github_owner = local.cicd_enabled ? split("/", var.github_repo)[0] : ""
  github_name  = local.cicd_enabled ? split("/", var.github_repo)[1] : ""
  github_sub_patterns = length(var.github_sub_claims) > 0 ? var.github_sub_claims : [
    "repo:${var.github_repo}:*",
    "repo:${local.github_owner}@*/${local.github_name}@*:*",
  ]
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider && local.cicd_enabled ? 1 : 0

  url             = "https://${local.gh_oidc_host}"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "cicd_assume" {
  count = local.cicd_enabled ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [local.gh_oidc_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.gh_oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "${local.gh_oidc_host}:sub"
      values   = local.github_sub_patterns
    }
  }
}

data "aws_iam_policy_document" "cicd_permissions" {
  count = local.cicd_enabled ? 1 : 0

  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPushPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
    ]
    resources = ["arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/${local.name_prefix}"]
  }

  statement {
    sid       = "EcsDeploy"
    actions   = ["ecs:UpdateService", "ecs:DescribeServices"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ecs:cluster"
      values   = ["arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:cluster/${local.name_prefix}-cluster"]
    }
  }

  # update-service --task-definition necesita pasar los roles de la task a ECS
  statement {
    sid     = "EcsPassRole"
    actions = ["iam:PassRole"]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.name_prefix}-task-exec",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.name_prefix}-task",
    ]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  statement {
    sid       = "S3Sync"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${module.frontend.bucket_name}"]
  }

  statement {
    sid       = "S3Objects"
    actions   = ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"]
    resources = ["arn:aws:s3:::${module.frontend.bucket_name}/*"]
  }

  statement {
    sid       = "CloudFrontInvalidate"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${module.frontend.cloudfront_distribution_id}"]
  }
}

resource "aws_iam_role" "cicd" {
  count = local.cicd_enabled ? 1 : 0

  name               = "${local.name_prefix}-gha-deploy"
  assume_role_policy = data.aws_iam_policy_document.cicd_assume[0].json
}

resource "aws_iam_role_policy" "cicd" {
  count = local.cicd_enabled ? 1 : 0

  name   = "deploy"
  role   = aws_iam_role.cicd[0].id
  policy = data.aws_iam_policy_document.cicd_permissions[0].json
}

output "cicd_deploy_role_arn" {
  description = "ARN del rol para la variable AWS_DEPLOY_ROLE_ARN de GitHub Actions"
  value       = local.cicd_enabled ? aws_iam_role.cicd[0].arn : null
}
