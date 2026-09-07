# gaege.fyi — Containerized AWS Deployment

A small static website used as a hands-on cloud engineering project.

The project started as a simple S3 + CloudFront static-site deployment and was migrated to a containerized architecture running Docker on Amazon EC2, with automated image builds and deployments through GitHub Actions, Amazon ECR, and AWS Systems Manager.

The goal was not to build a complicated application. The goal was to understand the infrastructure underneath a modern cloud deployment and make each architectural decision deliberately.

## Architecture

```text
                         GitHub
                           │
                           │ git push
                           ▼
                    GitHub Actions
                           │
                    ┌──────┴──────┐
                    │             │
                 Build         AWS OIDC
                 Docker           │
                    │             │
                    ▼             ▼
                  Amazon ECR    AWS IAM
                    │
                    │ Docker image
                    ▼
             AWS Systems Manager
                    │
                    │ Run deployment commands
                    ▼
                Amazon EC2
                    │
                  Docker
                    │
                  nginx
                    │
                    │ HTTP :80
                    ▼
                CloudFront
                    │
                    │ HTTPS
                    ▼
                  Users
```

### Production Request Path

```text
Browser
   │
   │ HTTPS
   ▼
CloudFront
   │
   │ HTTP :80
   ▼
EC2
   │
   ▼
Docker
   │
   ▼
nginx
   │
   ▼
Static files
```

CloudFront terminates HTTPS at the edge and forwards HTTP traffic to the EC2 origin.

The EC2 security group does not expose port 80 to the public internet. HTTP traffic is restricted to the AWS-managed CloudFront origin-facing prefix list.

SSH access is restricted to the administrator's IP address.

---

## Why This Architecture?

The original site was served directly from Amazon S3 through CloudFront.

That architecture was perfectly adequate for the workload, but it provided very little hands-on experience with compute, containers, image registries, server deployment, IAM, and infrastructure security.

Rather than immediately introducing ECS, Fargate, an Application Load Balancer, or other managed services, the project intentionally uses a single EC2 instance.

This makes the underlying deployment mechanics visible:

- What is actually running?
- Where does the container image live?
- How does the server obtain that image?
- How does a deployment replace the running container?
- How does GitHub authenticate to AWS?
- How does AWS authenticate the EC2 instance?
- How does traffic reach the container?
- What happens when CloudFront has cached the old version?

The architecture is intentionally simple because the purpose of the project is learning and demonstrating fundamentals rather than optimizing for a high-traffic workload.

---

## Technology

| Component | Purpose |
|---|---|
| Docker | Containerizes the static website |
| nginx | Serves the static files |
| Amazon ECR | Stores versioned Docker images |
| Amazon EC2 | Runs the production container |
| AWS Systems Manager | Executes deployment commands remotely |
| IAM | Controls access between AWS and GitHub |
| GitHub Actions | Builds and deploys the application |
| GitHub OIDC | Authenticates GitHub Actions without long-lived AWS credentials |
| CloudFront | HTTPS, CDN, and public entry point |
| Security Groups | Restrict network access to the EC2 instance |
| Amazon S3 | Retained as the previous deployment/origin for rollback |

---

# Containerization

The site consists of three static assets:

```text
index.html
style.css
hero.png
```

The Docker image uses nginx as the web server:

```dockerfile
FROM nginx:alpine

COPY index.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY hero.png /usr/share/nginx/html/

EXPOSE 80
```

The image is intentionally minimal. nginx provides the HTTP server while Docker provides the runtime isolation and packaging.

## Local Development

Build the image:

```bash
docker build -t gr-smart-site .
```

Run it:

```bash
docker run --rm -p 8080:80 gr-smart-site
```

The site is then available at:

```text
http://localhost:8080
```

Docker Compose is also provided for local development:

```bash
docker compose up
```

---

# Image Registry

Docker images are stored in Amazon ECR.

The repository is:

```text
gr-smart-site
```

Images are tagged using the Git commit SHA rather than relying on `latest`.

For example:

```text
gr-smart-site:f9dabbe4ca5be99cda55cf60002369ae10c0b481
```

This provides immutable deployment references.

Instead of production asking:

> What does `latest` mean right now?

we can ask:

> Which exact commit is running?

That also provides a straightforward rollback mechanism because previous images remain identifiable by commit SHA.

---

# CI/CD Pipeline

A push to `main` triggers GitHub Actions.

The deployment pipeline is:

```text
git push
    │
    ▼
GitHub Actions
    │
    ├── Checkout repository
    │
    ├── Authenticate to AWS using OIDC
    │
    ├── Build Docker image
    │
    ├── Push image to Amazon ECR
    │
    ├── Send deployment command through SSM
    │
    ▼
Amazon EC2
    │
    ├── Authenticate to ECR
    ├── Pull new image
    ├── Stop previous container
    ├── Remove previous container
    └── Start new container
    │
    ▼
CloudFront cache invalidation
```

The result is a deployment process that requires no manual SSH session.

---

# AWS Authentication

GitHub Actions does not use a stored AWS access key.

Instead, GitHub's OIDC identity is exchanged with AWS STS to assume an IAM role.

```text
GitHub Actions
      │
      │ OIDC token
      ▼
AWS STS
      │
      │ AssumeRoleWithWebIdentity
      ▼
github-actions-ecr
```

The IAM role is restricted by its trust policy to the GitHub repository and deployment branch.

This avoids storing long-lived AWS credentials in GitHub Secrets.

The GitHub Actions role is limited to the operations required by the pipeline:

- Push images to the ECR repository
- Send deployment commands through SSM
- Create CloudFront invalidations

---

# EC2 Authentication and Deployment

The EC2 instance has an IAM role that allows it to:

- Pull images from ECR
- Communicate with AWS Systems Manager

The deployment itself is performed through SSM.

The deployment process executes commands equivalent to:

```bash
docker pull <image>:<commit-sha>

docker stop gaege-fyi-web
docker rm gaege-fyi-web

docker run -d \
  --restart unless-stopped \
  --name gaege-fyi-web \
  -p 80:80 \
  <image>:<commit-sha>
```

This means GitHub Actions never needs an SSH private key to deploy the application.

---

# Network Security

The EC2 instance is not intended to be a publicly accessible web server.

CloudFront is the public entry point.

The security group allows:

```text
TCP 80
Source: AWS CloudFront origin-facing prefix list
```

SSH is restricted to the administrator's IP address.

Public HTTP access was intentionally removed after verifying that CloudFront could reach the origin successfully.

The resulting request path is:

```text
Internet
   │
   ▼
CloudFront
   │
   │ allowed
   ▼
EC2 :80
```

while:

```text
Internet
   │
   │ direct HTTP
   ▼
EC2 :80
   │
   X blocked by security group
```

This prevents users from bypassing CloudFront and reaching the origin directly.

---

# CloudFront Caching

One of the more interesting deployment issues encountered during the migration was CloudFront caching.

After a successful deployment:

```text
EC2 → new container → new content
```

was confirmed.

However:

```text
CloudFront → old cached content
```

was still being returned.

This demonstrated an important distinction between updating an origin and updating what users actually receive from a CDN.

The deployment therefore includes a CloudFront invalidation after a successful EC2 deployment:

```bash
aws cloudfront create-invalidation \
  --distribution-id <distribution-id> \
  --paths "/*"
```

For this extremely small site, invalidating the entire cache is simple and inexpensive. A more sophisticated application could use cache policies, versioned assets, or more targeted invalidations.

---

# Migration Strategy

The migration from S3 to EC2 was performed without changing the public domain.

The original S3 origin was retained while the EC2 deployment was established.

The migration path was:

```text
                 ┌───────────────┐
                 │      S3       │
                 │    Origin     │
                 └───────┬───────┘
                         │
                    previous
                    production

                         ↓

                 ┌───────────────┐
                 │      EC2      │
                 │    Docker     │
                 │     nginx     │
                 └───────┬───────┘
                         │
                    new origin
```

CloudFront was then switched to the EC2 origin.

Keeping the S3 origin during the migration provided a simple rollback option if the new origin failed.

No DNS migration was required because CloudFront remained the public endpoint.

---

# Architectural Decisions

## Why EC2 instead of ECS/Fargate?

The application is extremely small and the primary objective is learning.

ECS would abstract away many of the server and container-management concepts this project is intended to expose.

EC2 makes it possible to directly observe:

- The Linux host
- Docker
- Container lifecycle
- Image pulls
- Port mappings
- IAM instance roles
- Network interfaces
- Security groups
- Remote deployment

ECS/Fargate would be a reasonable direction for a production workload with more demanding availability and scaling requirements, but it would add abstraction before those abstractions were useful.

## Why no Application Load Balancer?

There is currently one EC2 instance running a single static website.

An ALB would introduce another infrastructure component without solving an actual requirement.

There is no need for:

- Multiple application instances
- Load balancing
- Path-based routing
- Application-level health checks

CloudFront can communicate directly with the EC2 origin.

If the application later required multiple instances, an ALB could become a reasonable architectural evolution.

## Why keep CloudFront?

CloudFront already provides:

- Public HTTPS
- CDN caching
- A stable public endpoint
- Origin abstraction
- The ability to change the underlying origin without changing DNS

Keeping CloudFront also means the EC2 instance does not need to handle public TLS termination.

---

# Lessons Learned

This project reinforced several practical cloud engineering concepts.

## 1. Inspect actual infrastructure state

AWS configuration is easy to misremember.

During the project, a security group was modified that was not actually attached to the EC2 instance.

Querying the instance's actual configuration exposed the mismatch.

The lesson:

> Don't debug what you think AWS is doing. Debug what AWS is actually doing.

## 2. IAM trust and permissions are different

The GitHub OIDC failure demonstrated the difference between:

**Trust policy**

> Who can assume this role?

and:

**Permissions policy**

> What can that role do after assuming it?

Both need to be correct.

## 3. Containers are not virtual machines

The EC2 instance is the host.

Docker runs the container on that host.

The container's:

```text
80/tcp
```

does not automatically expose port 80 to the internet.

The host mapping:

```bash
-p 80:80
```

connects:

```text
EC2 host :80
        ↓
container :80
```

## 4. A successful deployment does not guarantee fresh content

The EC2 container can be running the newest image while users still receive cached content from CloudFront.

The entire request path must be considered when debugging deployments.

## 5. Immutable image tags make deployments understandable

Using Git commit SHAs allows production to reference an exact artifact.

```text
Git commit
    ↓
Docker image
    ↓
ECR
    ↓
EC2
```

The artifact can be traced all the way back to source control.

---

# Current State

The current production deployment is:

```text
GitHub
   ↓
GitHub Actions
   ↓
Amazon ECR
   ↓
AWS Systems Manager
   ↓
Amazon EC2
   ↓
Docker
   ↓
nginx
   ↓
CloudFront
   ↓
gaege.fyi
```

A deployment can be triggered simply by pushing to `main`:

```bash
git push origin main
```

The resulting commit is built into a Docker image, pushed to ECR, deployed to EC2, and exposed through the existing CloudFront distribution.

---

# Future Improvements

This project intentionally stops before introducing unnecessary complexity.

Potential future iterations include:

- Automated rollback when a deployment health check fails
- Docker image lifecycle policies in ECR
- Container health checks
- Zero-downtime deployments
- Automated infrastructure provisioning with Terraform or CloudFormation
- Removing direct SSH access and managing the instance entirely through SSM
- Separate staging and production environments
- Blue/green deployments
- Moving from EC2 to ECS/Fargate when the workload justifies the additional abstraction
- Monitoring and alerting with CloudWatch
- Automated testing before deployment

These are deliberately left as future architectural decisions rather than requirements added solely for complexity.