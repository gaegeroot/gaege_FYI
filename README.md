# gaege.fyi — Astro Static Site on AWS

A small personal website and hands-on cloud engineering project.

The site began as a simple static website hosted on Amazon S3 behind CloudFront. I later moved it to a containerized deployment on Amazon EC2 to get practical experience with Docker, image registries, IAM, remote deployment, and network security. The current implementation returns to a static architecture, now using Astro to generate the site and Markdown to make writing and publishing straightforward.

That evolution is deliberate. The containerized version was a useful infrastructure exercise, but the actual workload is still a content-focused website. There is no need to run a server or maintain a container just to serve static pages. The current architecture keeps the useful deployment lessons while removing infrastructure that does not serve a real requirement.

## Current Architecture

```text
Developer
   │
   │ git push to main
   ▼
GitHub Repository
   │
   ▼
GitHub Actions
   ├── Install dependencies
   ├── Build Astro site
   └── Authenticate to AWS using GitHub OIDC
          │
          ▼
      AWS IAM / STS
          │
          ▼
      Amazon S3
      Static build output (dist/)
          │
          ▼
      CloudFront
      CDN and public HTTPS entry point
          │
          ▼
      Visitors
```

### Production request path

```text
Browser
   │ HTTPS
   ▼
CloudFront
   │
   ▼
Amazon S3 origin
   │
   ▼
Generated HTML, CSS, JavaScript, and static assets
```

CloudFront remains the public entry point for `gaege.fyi`. Astro generates static files during the build; there is no application server required to render pages for visitors. The exact S3 origin-access configuration is managed in AWS and should be checked there rather than inferred from this diagram.

## Why Astro and Static Hosting?

The website needs to present professional experience and projects, publish occasional technical writing, and support a small amount of browser-side JavaScript. It does not need a continuously running server, a database, or a container runtime.

Astro gives the project a convenient component and layout system, static page generation, and a Markdown-based writing workflow while keeping client-side JavaScript optional and limited to places where it adds value.

Static hosting is a better fit for these requirements because it:

- Avoids paying to keep an EC2 instance running for a site that serves static files.
- Removes the need to build and publish Docker images for ordinary content changes.
- Removes the ECR → SSM → EC2 deployment chain from the production path.
- Reduces server patching, host administration, container lifecycle, and origin networking concerns.
- Keeps deployments simple and repeatable: build the site, sync the output to S3, and refresh CloudFront's cache.
- Leaves room to add content and small enhancements without prematurely introducing backend infrastructure.

This is not a rejection of containers or the lessons from the previous architecture. It is an example of choosing an architecture based on the workload instead of retaining infrastructure solely because it is more complicated.

## Technology

| Component | Purpose |
|---|---|
| Astro | Builds the site into static output |
| Markdown | Authoring format for technical notes and blog posts |
| HTML, CSS, JavaScript | Site markup, visual design, and small browser-side interactions |
| GitHub | Source control and project history |
| GitHub Actions | Builds and deploys the site on pushes to `main` |
| GitHub OIDC | Lets GitHub Actions obtain temporary AWS credentials without stored AWS access keys |
| AWS IAM / STS | Establishes the deployment role and controls its permissions |
| Amazon S3 | Stores the generated static site |
| Amazon CloudFront | CDN, public HTTPS entry point, and cache layer |

## Local Development

Install dependencies using the repository's lockfile:

```bash
npm ci
```

Start the local development server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Preview the generated production build locally:

```bash
npm run preview
```

Astro's production output is written to `dist/`. That directory contains the finished site and is what gets uploaded to S3. It is generated output; edit the Astro components, styles, scripts, and content sources instead of editing files in `dist/` directly.

## Writing and Content

The site is designed to support occasional blog posts without introducing a CMS or backend. Posts are authored as Markdown in the content location configured by the Astro project.

To add a post:

1. Create a Markdown file in the configured writing/content collection.
2. Follow the frontmatter schema used by that collection for the title, description, publication date, tags, and draft status.
3. Write the article in Markdown, using fenced code blocks for examples where useful.
4. Run the local development server and review the post.
5. Build the site and publish through the usual Git workflow.

Use the content schema already defined in the repository as the source of truth for frontmatter field names. Posts marked as drafts should remain excluded from public listings and production output according to the site's content configuration.

## CI/CD Deployment

A push to `main` triggers GitHub Actions. The workflow builds the site and uploads the generated output to the existing S3 website bucket. It then invalidates the CloudFront cache so visitors can receive the new version.

The current deployment flow is:

```text
git push origin main
        │
        ▼
GitHub Actions
        │
        ├── Check out repository
        ├── Install dependencies from the lockfile
        ├── Build Astro into dist/
        ├── Assume the AWS deployment role using OIDC
        ├── Sync dist/ to S3
        └── Invalidate CloudFront cache
```

The workflow uses the `github-actions-deploy` IAM role rather than the previous `github-actions-ecr` role. The deployment role is intended for the operations required by a static-site release: listing the site bucket, managing its objects, and creating a CloudFront invalidation. It does not need ECR push permissions or EC2/SSM deployment permissions for this workflow.

### AWS deployment details

- **S3 bucket:** `gr-smart-static-site-750521683811-us-west-1-an`
- **S3 region:** `us-west-1`
- **CloudFront distribution:** configured for the `gaege.fyi` site in AWS
- **Deployment branch:** `main`
- **Build output:** `dist/`
- **Authentication:** GitHub OIDC → AWS STS → `github-actions-deploy`

CloudFront's API is global but the AWS CLI accepts a region parameter; the workflow can explicitly use `us-east-1` for the invalidation step while using `us-west-1` for S3 operations.

The workflow uses `aws s3 sync dist/ s3://<bucket>/ --delete`. The `--delete` option removes objects from the destination that are no longer present in the new build. This is appropriate only because the destination is intended to contain this site's generated files; unrelated files should not be stored in the same deployment destination.

The full CloudFront invalidation (`/*`) is simple for a small site. If the site grows, immutable/versioned assets and more targeted cache invalidations may be worth considering.

### IAM and OIDC

GitHub Actions does not need a long-lived AWS access key. GitHub issues an OIDC token, which AWS STS exchanges for temporary credentials after validating the IAM role's trust policy.

There are two distinct IAM concerns:

- **Trust policy:** which GitHub repository and branch are allowed to assume the role.
- **Permissions policy:** which AWS operations the assumed role may perform.

Both must be correct. The current trust policy is restricted to the intended GitHub repository and `main` branch; the permissions policy grants the S3 and CloudFront actions required for deployment.

## How the Architecture Evolved

The history of the project is part of its purpose. The simplest architecture was not necessarily the best learning exercise, and the most educational architecture is not necessarily the best long-term fit for the website.

### Phase 1: S3 + CloudFront static site

The original site was a small collection of static assets hosted in S3 and delivered through CloudFront. It was operationally simple and appropriate for the workload, but offered limited hands-on experience with compute, container deployment, server configuration, and origin security.

### Phase 2: Containerized deployment on EC2

I deliberately migrated the static site to a Docker container running on a single EC2 instance. GitHub Actions built an image, tagged it using the Git commit SHA, pushed it to Amazon ECR, and issued deployment commands through AWS Systems Manager. The instance pulled the new image and replaced the running container, with CloudFront remaining the public endpoint.

The historical stack included:

| Component | Role in the containerized phase |
|---|---|
| Docker | Packaged the static files and web server |
| nginx | Served the files inside the container |
| Amazon ECR | Stored versioned container images |
| Amazon EC2 | Ran the container |
| AWS Systems Manager | Ran remote deployment commands without requiring an SSH session from GitHub Actions |
| IAM and GitHub OIDC | Controlled and authenticated the deployment process |
| Security groups | Restricted direct access to the EC2 origin |
| CloudFront | Continued to provide public HTTPS, caching, and a stable entry point |

Images were tagged with Git commit SHAs instead of relying on `latest`. This made it possible to connect a deployed artifact to a specific source revision and to identify previous images for a rollback.

The EC2 origin was configured so HTTP traffic was intended to arrive through CloudFront, using the AWS-managed CloudFront origin-facing prefix list in the instance's security group. This reduced the ability to bypass CloudFront and reach the origin directly. SSH access was separately restricted to an administrator IP during that phase.

This architecture was useful as a learning exercise because it made several concepts concrete: Linux host administration, Docker lifecycle, image registries, deployment commands, instance roles, security groups, origin behavior, and the separation between successful origin deployment and what a CDN returns to users.

### Phase 3: Back to static hosting, now with Astro

The current implementation returns to S3 and CloudFront, but the site is no longer just a hand-maintained `index.html` and a few static assets. Astro provides a maintainable source structure and generates the complete static site at build time. Markdown makes it practical to publish technical notes as the portfolio evolves.

The current deployment process keeps the valuable parts of the earlier work—version control, automated builds, OIDC-based access, scoped IAM permissions, and cache invalidation—without retaining infrastructure that the site no longer needs.

This is the central architectural lesson of the project: use additional infrastructure when it solves a real requirement or provides a deliberate learning objective, not simply because it is available.

## Lessons Learned

### 1. Inspect actual infrastructure state

AWS configuration is easy to misremember. During the EC2 phase, a security group was modified that was not actually attached to the instance. Inspecting the instance's actual configuration exposed the mismatch.

> Don't debug what you think AWS is doing. Debug what AWS is actually doing.

### 2. IAM trust and permissions are different

The GitHub OIDC setup reinforced the distinction between a role's trust policy and its permissions policy. The trust policy answers who can assume a role; the permissions policy answers what that role can do after it is assumed. Both need to be correct.

### 3. Containers are not virtual machines

During the EC2 phase, the instance was the host and Docker ran the container on it. A container's exposed port did not automatically mean that the service was reachable from the public internet; host port mapping and security-group rules determined how traffic could reach it.

### 4. A successful deployment does not guarantee fresh content

During the containerized phase, the new container was running while CloudFront still returned old cached content. Updating an origin and updating what users receive from a CDN are separate events. The current static deployment retains a CloudFront invalidation after publishing new files for the same reason.

### 5. Immutable artifacts improve traceability

Tagging Docker images with Git commit SHAs made the relationship between source code, a built artifact, and a running deployment explicit. The current static pipeline no longer publishes container images, but the underlying idea remains useful: build and deploy from a known source revision and keep the release process reproducible.

### 6. Prefer the simplest architecture that fits the real workload

The EC2 version provided useful experience with containers and server deployment. Once that learning objective had been met, maintaining a VM, container registry, remote deployment mechanism, and origin security rules no longer justified their overhead for a static personal site. Returning to S3 and CloudFront is a deliberate right-sizing decision, not a loss of capability.

## Current Architectural Decisions

### Why static output instead of a running application server?

The website's content can be generated before deployment. Its homepage, work history, project information, and writing pages do not require server-side rendering for every request. Static output therefore removes an unnecessary runtime while retaining support for small JavaScript enhancements in the browser.

### Why S3 and CloudFront?

S3 stores the built site and CloudFront provides the public delivery layer. This keeps the hosting model simple, avoids a continuously running compute instance, and allows the underlying content to be updated without changing the public domain.

### Why GitHub Actions and OIDC?

A push to `main` provides a repeatable release trigger. GitHub Actions builds the site and assumes a narrowly scoped AWS role through OIDC instead of relying on stored long-lived AWS access keys. The role grants only the S3 and CloudFront operations needed by the static deployment.

### Why not add a backend or CMS?

The site needs occasional articles, not a live publishing platform. Markdown in version control is sufficient for now. A database, user accounts, a CMS, or a backend service would add operational complexity without solving a current requirement.

## Follow-up Considerations

The current architecture is intentionally small. Potential improvements should remain tied to actual needs:

- Verify that CloudFront's origin and S3 access configuration match the intended static hosting model.
- Test nested Astro routes, especially writing pages. Depending on the CloudFront/S3 origin configuration and URL format, a rewrite or error-response strategy may be needed to map clean URLs to generated `index.html` files.
- Add automated link checks or other lightweight build validation if they become useful.
- Consider more targeted cache invalidations or longer-lived caching for versioned Astro assets.
- Add an RSS feed if technical writing becomes a regular part of the site.
- Consider infrastructure as code if the hosting configuration starts to change often enough to justify formalizing it.

These remain optional follow-ups rather than requirements added for complexity's sake.
