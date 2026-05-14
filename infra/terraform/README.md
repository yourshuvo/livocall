# LivoCall Terraform (sketch)

This directory is a starting point for LivoCall's managed-service topology.
It is **not** complete — production operators should fork and customise.

## Components

| Resource                  | Why                                                       |
| ------------------------- | --------------------------------------------------------- |
| MongoDB Atlas cluster     | Persistent store for Org / User / Agent / Call documents  |
| Redis (Upstash or ElastiCache) | Leader-lock + rate-limit + short-lived job metadata  |
| S3 bucket (recordings)    | WAV audio store for call recordings                        |
| Vercel project (web)      | Next.js deployment target                                  |
| Fly.io app (voice)        | FastAPI + Pipecat container, BD-region preferred           |
| FreeSWITCH VM             | Dedicated SIP box on a BD IP range                         |

## Example stub

```hcl
terraform {
  required_providers {
    mongodbatlas = { source = "mongodb/mongodbatlas", version = "~> 1.18" }
    aws          = { source = "hashicorp/aws", version = "~> 5.0" }
    vercel       = { source = "vercel/vercel", version = "~> 1.10" }
  }
}

variable "project_name"   { default = "livocall" }
variable "env"            { default = "prod" }

resource "aws_s3_bucket" "recordings" {
  bucket = "${var.project_name}-${var.env}-recordings"
  lifecycle_rule {
    id      = "expire-90d"
    enabled = true
    expiration { days = 90 }
  }
}

resource "mongodbatlas_cluster" "db" {
  project_id   = var.atlas_project_id
  name         = "${var.project_name}-${var.env}"
  provider_name = "AWS"
  provider_region_name = "AP_SOUTH_1"
  provider_instance_size_name = "M10"
}

resource "vercel_project" "web" {
  name      = "${var.project_name}-web"
  framework = "nextjs"
  environment = [
    { key = "MONGODB_URL",        value = mongodbatlas_cluster.db.connection_strings[0].standard_srv, target = ["production"] },
    { key = "S3_RECORDINGS_BUCKET", value = aws_s3_bucket.recordings.bucket, target = ["production"] },
  ]
}
```

Apply with:

```
terraform init
terraform plan -var-file=prod.tfvars
terraform apply -var-file=prod.tfvars
```

Secrets (`SESSION_PASSWORD`, `WEB_SHARED_SECRET`, `VOICE_WS_SHARED_SECRET`, etc.)
should live in a secrets manager (AWS Secrets Manager / HashiCorp Vault / Doppler).
