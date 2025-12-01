# GitHub Actions Workflows

## Build and Push Docker Images

Workflow ini akan otomatis build dan push Docker images ke GitHub Container Registry (ghcr.io) ketika:

- Push ke branch `main` atau `master`
- Push tag dengan format `v*` (contoh: `v0.27.5`)
- Manual trigger via GitHub Actions UI

### Images yang di-build:

1. **analytics-service** - AI service untuk text-to-SQL
   - Image: `ghcr.io/<OWNER>/analytics-service:<tag>`
   - Context: `./analytics-ai-service`
   - Dockerfile: `./analytics-ai-service/docker/Dockerfile`

2. **analytics-ui** - Web UI untuk Analytics AI
   - Image: `ghcr.io/<OWNER>/analytics-ui:<tag>`
   - Context: `./analytics-ui`
   - Dockerfile: `./analytics-ui/Dockerfile`

### Tag yang di-generate:

- `latest` - untuk branch default (main/master)
- `<branch-name>` - untuk branch lain
- `<branch-name>-<sha>` - dengan commit SHA
- `v<version>` - untuk semantic version tags
- `v<major>.<minor>` - untuk minor version
- `v<major>` - untuk major version

### Cara menggunakan:

1. **Automatic build** - Push ke main/master atau create tag:
   ```bash
   git tag v0.27.5
   git push origin v0.27.5
   ```

2. **Manual trigger**:
   - Go to Actions tab di GitHub
   - Pilih "Build and Push Docker Images"
   - Klik "Run workflow"
   - Optional: masukkan version tag

3. **Pull images**:
   ```bash
   # Login ke GitHub Container Registry
   echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
   
   # Pull images
   docker pull ghcr.io/<OWNER>/analytics-service:latest
   docker pull ghcr.io/<OWNER>/analytics-ui:latest
   ```

### Update docker-compose untuk menggunakan images:

```yaml
services:
  analytics-service:
    image: ghcr.io/<OWNER>/analytics-service:latest
    # ... rest of config

  analytics-ui:
    image: ghcr.io/<OWNER>/analytics-ui:latest
    # ... rest of config
```

### Catatan:

- Images akan di-build untuk platform `linux/amd64`
- Build menggunakan GitHub Actions cache untuk mempercepat build
- PR tidak akan push images (hanya build untuk testing)

