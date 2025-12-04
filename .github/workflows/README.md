# GitHub Actions Workflows

## Overview

This directory contains GitHub Actions workflows for automated building, testing, and deployment of NQRust-Analytics Docker images.

## Workflows

### Build and Push Docker Images

**Trigger Events:**
- Push to `main` or `master` branch
- Push tags matching `v*` pattern (e.g., `v0.27.5`)
- Manual trigger via GitHub Actions UI

### Images Built

#### 1. Analytics AI Service
- **Image**: `ghcr.io/{owner}/analytics-ai-service:{tag}`
- **Context**: `./analytics-ai-service`
- **Dockerfile**: `./analytics-ai-service/docker/Dockerfile`
- **Description**: AI service for natural language to SQL conversion

#### 2. Analytics UI
- **Image**: `ghcr.io/{owner}/analytics-ui:{tag}`
- **Context**: `./analytics-ui`
- **Dockerfile**: `./analytics-ui/Dockerfile`
- **Description**: Web interface for the analytics platform

#### 3. Analytics Engine
- **Image**: `ghcr.io/{owner}/analytics-engine:{tag}`
- **Context**: `./analytics-engine`
- **Description**: Query execution engine

#### 4. Ibis Server
- **Image**: `ghcr.io/{owner}/analytics-engine-ibis:{tag}`
- **Context**: `./analytics-engine/ibis-server`
- **Description**: Data connectivity layer

## Image Tags

Tags are automatically generated based on the trigger:

- `latest` - For default branch (main/master)
- `{branch-name}` - For other branches
- `{branch-name}-{sha}` - With commit SHA
- `v{version}` - For semantic version tags
- `v{major}.{minor}` - Minor version tag
- `v{major}` - Major version tag

## Usage

### Automatic Build

Push to main branch or create a tag:

```bash
# Push to main (creates 'latest' tag)
git push origin main

# Create and push version tag
git tag v0.27.5
git push origin v0.27.5
```

### Manual Trigger

1. Go to **Actions** tab in GitHub
2. Select **Build and Push Docker Images**
3. Click **Run workflow**
4. (Optional) Enter version tag
5. Click **Run workflow** button

### Pull Images

```bash
# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Pull latest images
docker pull ghcr.io/{owner}/analytics-ai-service:latest
docker pull ghcr.io/{owner}/analytics-ui:latest
docker pull ghcr.io/{owner}/analytics-engine:latest
docker pull ghcr.io/{owner}/analytics-engine-ibis:latest
```

## Using Images in Docker Compose

Update your `docker-compose.yaml`:

```yaml
services:
  analytics-ai-service:
    image: ghcr.io/{owner}/analytics-ai-service:latest
    # ... rest of configuration

  analytics-ui:
    image: ghcr.io/{owner}/analytics-ui:latest
    # ... rest of configuration

  analytics-engine:
    image: ghcr.io/{owner}/analytics-engine:latest
    # ... rest of configuration

  ibis-server:
    image: ghcr.io/{owner}/analytics-engine-ibis:latest
    # ... rest of configuration
```

Replace `{owner}` with your GitHub username or organization name.

## Build Configuration

### Platform Support

- **Default**: `linux/amd64`
- **Multi-arch**: Some workflows support `linux/arm64`

### Build Cache

- Uses GitHub Actions cache for faster builds
- Cache is automatically managed per workflow

### Pull Request Builds

- Pull requests trigger builds for testing
- Images are **not pushed** to registry
- Only build validation is performed

## Workflow Files

- `build-and-push-images.yml` - Main build workflow
- `ai-service-release-image.yaml` - AI service releases
- `ai-service-release-nightly-image.yaml` - Nightly AI service builds
- `ai-service-release-stable-image.yaml` - Stable AI service releases
- `ui-release-image.yaml` - UI releases
- `ui-release-image-stable.yaml` - Stable UI releases
- `analytics-launcher-ci.yaml` - Launcher CI/CD
- `create-rc-release-pr.yaml` - Release candidate automation

## Secrets Required

The workflows require the following secrets (automatically provided by GitHub):

- `GITHUB_TOKEN` - For pushing to GitHub Container Registry
- `CI_APP_ID` - For automated release PRs (optional)
- `CI_APP_PRIVATE_KEY` - For automated release PRs (optional)

## Troubleshooting

### Build Failures

Check the workflow logs in the Actions tab:

1. Go to **Actions** tab
2. Click on the failed workflow run
3. Review the logs for each step

Common issues:
- Docker build errors (check Dockerfile syntax)
- Test failures (fix tests before merging)
- Registry permission errors (check GITHUB_TOKEN permissions)

### Image Not Found

Ensure the image was successfully pushed:

1. Go to repository **Packages** tab
2. Verify the image exists with correct tag
3. Check package visibility (should be public or accessible to you)

### Permission Denied

When pulling images, ensure you're authenticated:

```bash
# Generate a personal access token with read:packages scope
# Then login:
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

## Contributing

When adding new services or modifying build processes:

1. Update relevant workflow files
2. Test locally with `docker build`
3. Create a pull request
4. Verify build succeeds in PR checks

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Docker Build Push Action](https://github.com/docker/build-push-action)
