# Despliegue GitOps del Sistema Restaurante POS

Proyecto universitario: Kubernetes + Argo CD + HPA. Se usa la aplicación React/Vite existente del repositorio.

## Archivos

- `Dockerfile`, `nginx.conf`: imagen web para la aplicación.
- `k8s/deployment.yml`: Deployment con dos réplicas, recursos CPU/memoria, probes HTTP e imagen GHCR.
- `k8s/service.yml`: Service tipo NodePort, puerto 30080.
- `k8s/hpa.yml`: HPA autoscaling/v2 con mínimo 2, máximo 5, CPU objetivo 50 %.
- `argocd/restaurante-application.yml`: Application declarativa con autosincronización y autorreparación.
- `.github/workflows/docker-image.yml`: compilación y publicación de la imagen en GHCR.

## Requisitos previos

1. Docker Desktop con Kubernetes activado (Settings > Kubernetes).
2. `kubectl` configurado para el contexto `docker-desktop`.
3. Metrics Server instalado y operativo para la métrica CPU.
4. Argo CD instalado en el namespace `argocd`.
5. Imagen `ghcr.io/johaog10/restaurantsistem:latest` publicada y **con acceso público** en GitHub Packages (si es privada, los pods tendrán ImagePullBackOff).
6. La interfaz necesita Supabase real para funcionar de forma completa. Definir las variables del repositorio `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para compilar la imagen con la configuración correcta. No subir claves `service_role` ni contraseñas.

## Publicar imagen

Abrir GitHub > Actions > Publicar imagen Docker > Run workflow.
En Settings > Secrets and variables > Actions > Variables configurar URL y publishable/anon key de Supabase **antes** de compilar.
En Packages, configurar el paquete como público si es necesario.
Si no se publican correctamente esas variables, la compilación o la integración de la app pueden no funcionar.
Los cambios futuros del código requieren reconstruir la imagen; si se usa la etiqueta mutable `latest`, Argo CD no detectará por sí solo un cambio de bytes de la imagen. Para una implementación GitOps completa de nuevas versiones, actualizar el tag/digest en `k8s/deployment.yml` en cada versión.

## Kubernetes y Argo CD

Comprobar contexto y recursos:

```powershell
kubectl config current-context
kubectl get nodes
kubectl get deployment metrics-server -n kube-system
kubectl top nodes
```

**No instalar Metrics Server a ciegas**: primero comprobar si existe. Si no existe, seguir el manifiesto oficial compatible con la versión del clúster. En Docker Desktop puede requerirse una configuración de TLS para kubelet; documentar cualquier ajuste en el informe.

Instalar Argo CD (si aún no está instalado):

```powershell
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl rollout status deployment/argocd-server -n argocd --timeout=300s
```

Registrar aplicación declarativa:

```powershell
kubectl apply -f argocd/restaurante-application.yml
kubectl get applications -n argocd
kubectl get pods -n gitops-restaurante
kubectl get service -n gitops-restaurante
kubectl get hpa -n gitops-restaurante
```

Acceso local al panel:

```powershell
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Panel: https://localhost:8080 (puede mostrar aviso de certificado autofirmado).
Para conocer la contraseña inicial sin ponerla en el informe:

```powershell
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" 
```

El valor anterior está codificado en base64: decodificarlo localmente y no fotografiarlo.

## Verificaciones para el informe

```powershell
kubectl rollout status deployment/restaurante-pos -n gitops-restaurante --timeout=180s
kubectl get deployments,pods,svc,hpa -n gitops-restaurante
kubectl describe hpa restaurante-pos -n gitops-restaurante
kubectl top pods -n gitops-restaurante
kubectl get application restaurante-pos -n argocd -o yaml
```

Acceder a `http://localhost:30080` si Docker Desktop expone el NodePort en localhost. Alternativa local confiable:

```powershell
kubectl port-forward svc/restaurante-pos 8081:80 -n gitops-restaurante
```

Abrir `http://localhost:8081` en el navegador.

## Prueba del HPA

- Capturar estado inicial de 2 réplicas y valor de CPU reportado por Metrics Server.
- Generar carga HTTP **únicamente contra este clúster propio**, por ejemplo con una herramienta local de pruebas de carga.
- Observar `kubectl get hpa -n gitops-restaurante -w` y `kubectl get pods -n gitops-restaurante -w`.
- Registrar resultado de escalamiento (si ocurre) y después retirar carga para documentar reducción.
- El aumento de pods no está garantizado por realizar pocas peticiones: depende del consumo medio de CPU y de la disponibilidad de métricas. Si no escala, se documenta el diagnóstico.

## Prueba de GitOps

Modificar una propiedad no gestionada por el HPA en `k8s/deployment.yml` (p. ej., una anotación en la plantilla de Pods), confirmar el commit y observar la sincronización automática en Argo CD. La aplicación ignora `spec.replicas` para evitar que GitOps anule cambios del HPA.

## Evidencias auténticas

Capturar GitHub, Docker Desktop, `kubectl get`, servicio web, Argo CD `Synced/Healthy`, prueba de cambios Git y datos reales del HPA. Ocultar contraseñas y tokens.
