# Kubernetes Deployment with Kustomize

## Overview

This directory contains Kubernetes manifests for deploying NQRust-Analytics using Kustomize. Kustomize allows you to customize Kubernetes configurations without modifying the original files.

## Prerequisites

- **Kubernetes Cluster**: 1.24+ (GKE, EKS, AKS, or self-hosted)
- **kubectl**: Kubernetes command-line tool
- **Kustomize**: Built into kubectl 1.14+
- **Helm**: For cert-manager installation (optional)

## Architecture

```
┌─────────────────┐
│   Ingress       │  ← External traffic
└────────┬────────┘
         │
    ┌────┴────┐
    │  nginx  │  ← Load balancer
    └────┬────┘
         │
    ┌────┴────────────────────┐
    │                         │
┌───┴────┐            ┌──────┴──────┐
│   UI   │            │ AI Service  │
└───┬────┘            └──────┬──────┘
    │                        │
    └────────┬───────────────┘
             │
    ┌────────┴────────┐
    │ Analytics Engine│
    └────────┬────────┘
             │
    ┌────────┴────────┐
    │  Ibis Server    │
    └─────────────────┘
```

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/NexusQuantum/NQRust-Analytics.git
cd NQRust-Analytics/deployment/kustomizations
```

### 2. Review Configuration

Check image versions in `kustomization.yaml`:

```yaml
images:
  - name: ghcr.io/nexusquantum/analytics-bootstrap
    newTag: 0.1.5
  - name: ghcr.io/nexusquantum/analytics-engine
    newTag: 0.14.8
  - name: ghcr.io/nexusquantum/analytics-ui
    newTag: 0.24.1
  - name: ghcr.io/nexusquantum/analytics-ai-service
    newTag: 0.19.7
  - name: ghcr.io/nexusquantum/analytics-engine-ibis
    newTag: 0.14.8
```

For latest versions, see [.env.example](../../docker/.env.example#L23)

### 3. Deploy with Kustomize

```bash
# Preview what will be deployed
kubectl kustomize . --enable-helm

# Apply to cluster
kubectl apply -k . --enable-helm
```

### 4. Verify Deployment

```bash
# Check pods
kubectl get pods -n analytics

# Check services
kubectl get svc -n analytics

# Check ingress
kubectl get ingress -n analytics
```

### 5. Access the Application

Get the ingress URL:

```bash
kubectl get ingress -n analytics
```

Access the UI at the provided URL.

## Configuration

### Environment Variables

Edit `base/cm.yaml` to configure:

```yaml
data:
  # Service endpoints
  ANALYTICS_ENGINE_ENDPOINT: http://analytics-engine-svc:8080
  ANALYTICS_AI_SERVICE_ENDPOINT: http://analytics-ai-service-svc:5555
  IBIS_SERVER_ENDPOINT: http://analytics-ibis-svc:8000
  
  # Versions
  ANALYTICS_PRODUCT_VERSION: "0.12.0"
  ANALYTICS_ENGINE_VERSION: "0.12.3"
  ANALYTICS_AI_SERVICE_VERSION: "0.12.1"
```

### Secrets

Create secrets for sensitive data:

```bash
# OpenAI API Key
kubectl create secret generic openai-secret \
  --from-literal=api-key=your_api_key_here \
  -n analytics

# Database credentials (if using external DB)
kubectl create secret generic db-credentials \
  --from-literal=username=dbuser \
  --from-literal=password=dbpass \
  -n analytics
```

Reference secrets in deployments:

```yaml
env:
  - name: OPENAI_API_KEY
    valueFrom:
      secretKeyRef:
        name: openai-secret
        key: api-key
```

### Persistent Storage

Configure storage class and size in `base/pvc.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: analytics-data-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: standard  # Change to your storage class
  resources:
    requests:
      storage: 10Gi  # Adjust size as needed
```

## Customization with Patches

### Using Patches

The `patches/` directory contains example patches for common customizations:

```bash
# Use patches as a base
cd patches
kubectl apply -k .
```

### Example: Custom ConfigMap

Create `patches/cm.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: analytics-config
data:
  ANALYTICS_AI_SERVICE_PORT: "5556"  # Custom port
  CUSTOM_SETTING: "value"
```

### Example: Resource Limits

Create `patches/resources.yaml`:

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
              cpu: "1000m"
            limits:
              memory: "4Gi"
              cpu: "2000m"
```

## GitOps Integration

### ArgoCD

Create an Application manifest:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nqrust-analytics
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/NexusQuantum/NQRust-Analytics.git
    targetRevision: main
    path: deployment/kustomizations
  destination:
    server: https://kubernetes.default.svc
    namespace: analytics
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

### FluxCD

Create a Kustomization resource:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: nqrust-analytics
  namespace: flux-system
spec:
  interval: 10m
  path: ./deployment/kustomizations
  prune: true
  sourceRef:
    kind: GitRepository
    name: nqrust-analytics
```

## Monitoring

### Prometheus

Add ServiceMonitor for metrics:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: analytics-metrics
spec:
  selector:
    matchLabels:
      app: analytics
  endpoints:
    - port: metrics
      interval: 30s
```

### Logging

Configure log aggregation with Fluentd/Fluent Bit:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
data:
  fluent.conf: |
    <source>
      @type tail
      path /var/log/containers/analytics-*.log
      pos_file /var/log/fluentd-analytics.pos
      tag kubernetes.*
      format json
    </source>
```

## Scaling

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: analytics-ai-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: analytics-ai-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n analytics

# Check logs
kubectl logs <pod-name> -n analytics

# Check events
kubectl get events -n analytics --sort-by='.lastTimestamp'
```

### Service Connection Issues

```bash
# Test service connectivity
kubectl run -it --rm debug --image=busybox --restart=Never -- sh
# Inside the pod:
wget -O- http://analytics-engine-svc:8080/health
```

### Storage Issues

```bash
# Check PVC status
kubectl get pvc -n analytics

# Check PV
kubectl get pv
```

## Cleanup

```bash
# Delete all resources
kubectl delete -k .

# Delete namespace
kubectl delete namespace analytics
```

## Advanced Topics

### Multi-Cluster Deployment

For deploying across multiple clusters, consider:
- Cluster Federation
- Service Mesh (Istio, Linkerd)
- Multi-cluster ingress

### High Availability

- Run multiple replicas of each service
- Use pod anti-affinity rules
- Configure readiness and liveness probes
- Use PodDisruptionBudgets

### Security

- Enable RBAC
- Use NetworkPolicies
- Scan images for vulnerabilities
- Rotate secrets regularly
- Use Pod Security Standards

## References

- [Kustomize Documentation](https://kustomize.io/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines on improving these manifests.
