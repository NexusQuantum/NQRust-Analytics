# Kustomization Patches

## Overview

This directory contains example patches for customizing the NQRust-Analytics Kubernetes deployment. Patches allow you to modify the base deployment without changing the original manifests.

## Purpose

Patches are useful for:
- **GitOps workflows**: Use base deployment as-is, apply your customizations via patches
- **Environment-specific configs**: Different settings for dev/staging/prod
- **Organization standards**: Apply your security policies, resource limits, etc.
- **Tool integration**: ArgoCD, FluxCD, and other GitOps tools

## Available Patches

### ConfigMap Patch (`cm.yaml`)

Customize environment variables and service configuration:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: analytics-config
data:
  # Override service ports
  ANALYTICS_AI_SERVICE_PORT: "5556"
  
  # Override endpoints
  ANALYTICS_ENGINE_ENDPOINT: http://custom-engine:8080
  
  # Add custom settings
  CUSTOM_FEATURE_FLAG: "enabled"
```

### Service Patch (`svc.yaml`)

Modify service configurations:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: analytics-ui-svc
spec:
  type: LoadBalancer  # Change from ClusterIP
  ports:
    - port: 80
      targetPort: 3000
```

## Usage

### Option 1: Use Patches Directly

```bash
cd deployment/kustomizations/patches
kubectl apply -k .
```

This applies the base deployment with all patches in this directory.

### Option 2: Create Custom Overlay

Create your own overlay directory:

```bash
mkdir -p overlays/production
cd overlays/production
```

Create `kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

# Reference base deployment
bases:
  - ../../base

# Apply patches
patchesStrategicMerge:
  - ../../patches/cm.yaml
  - custom-resources.yaml

# Override images
images:
  - name: ghcr.io/nexusquantum/analytics-ui
    newTag: v1.2.3-prod
```

Apply your overlay:

```bash
kubectl apply -k overlays/production
```

### Option 3: GitOps Integration

#### ArgoCD

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: analytics-prod
spec:
  source:
    repoURL: https://github.com/NexusQuantum/NQRust-Analytics.git
    path: deployment/kustomizations/patches
    targetRevision: main
  destination:
    namespace: analytics-prod
```

#### FluxCD

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: analytics
spec:
  path: ./deployment/kustomizations/patches
  sourceRef:
    kind: GitRepository
    name: analytics-repo
```

## Common Patch Patterns

### Resource Limits

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-ai-service
spec:
  template:
    spec:
      containers:
        - name: analytics-ai-service
          resources:
            requests:
              memory: "2Gi"
              cpu: "1"
            limits:
              memory: "4Gi"
              cpu: "2"
```

### Ingress Configuration

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: analytics-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - analytics.example.com
      secretName: analytics-tls
  rules:
    - host: analytics.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: analytics-ui-svc
                port:
                  number: 3000
```

### Secrets Management

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: analytics-secrets
type: Opaque
stringData:
  openai-api-key: ${OPENAI_API_KEY}
  database-password: ${DB_PASSWORD}
```

### Storage Class

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: analytics-data-pvc
spec:
  storageClassName: fast-ssd  # Use your storage class
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi
```

## Removing Components

To remove optional components (e.g., Certificate, Ingress):

```yaml
# In your kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

bases:
  - ../../base

# Remove specific resources
resources:
  - "!../../base/certificate.yaml"
  - "!../../base/ingress.yaml"
```

## Best Practices

1. **Version Control**: Keep patches in git
2. **Environment Separation**: Use different overlays for dev/staging/prod
3. **Minimal Patches**: Only patch what you need to change
4. **Documentation**: Comment your patches explaining why
5. **Testing**: Test patches in dev before production

## Validation

Preview changes before applying:

```bash
# See what will be applied
kubectl kustomize . --enable-helm

# Diff against current state
kubectl diff -k .

# Dry-run
kubectl apply -k . --dry-run=client
```

## Troubleshooting

### Patch Not Applied

Check patch syntax and ensure it matches the target resource:

```bash
kubectl kustomize . --enable-helm | grep -A 10 "kind: ConfigMap"
```

### Conflicting Patches

If multiple patches modify the same field, the last one wins. Use strategic merge or JSON patches for fine control.

### Resource Not Found

Ensure the resource name in your patch matches exactly:

```bash
kubectl get all -n analytics
```

## Examples

See [examples/](./examples/) directory for:
- Multi-environment setup
- Custom resource limits
- Advanced networking
- Security policies

## Contributing

To add new example patches:

1. Create the patch file
2. Document its purpose
3. Add usage example
4. Test in a cluster
5. Submit pull request

See [CONTRIBUTING.md](../../../CONTRIBUTING.md) for guidelines.