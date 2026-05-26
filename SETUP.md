## Uruchomienie lokalne

### Kubernetes na Minikube
Aby uruchomić kluster należy pobrać [minikube](https://minikube.sigs.k8s.io/docs/start/?arch=%2Fwindows%2Fx86-64%2Fstable%2F.exe+download) oraz uruchomić instancje na dockerze (`minikube start`). Jeżeli ustawiony jest kubectl config z zajęć to podmień na minikube: `kubectl config use-context minikube`. W pliku Makefile znajdują się 3 targety:

```Deploy całego clustra od 0
make deploy
```

```Usunięcie całego klastra (łącznie z namespace)
make delete
```

```Pokazanie statusu klastra
make status
```

### Połączenie się do przykładowej aplikacji

Jeżeli nie działa to prawdopodobnie kontener nie chodzi. Użyj `make status` aby sprawdzić czy pod/productpage-hash ma status running. Jeżeli nie to zrestartuj (`make delete`, `make deploy`)

```
kubectl run curl -n apps --rm -it --image=curlimages/curl -- sh
```

## Opis techniczny komponentów

Do zarządzania wszystkimi serwisami używamy kubernetesa. Aplikacja i część o11y będą w dwóch różnych namespacach: apps, olly.

### Przykładowa aplikacja

Na ten moment używamy aplikacji Bookinfo z dokumentacji Istio: https://istio.io/latest/docs/examples/bookinfo/. Aplikacja składa się z serwisów `productpage`, `details`, `ratings` oraz `reviews`.
Komendy do wykonania po tej zmianie:

```
kubectl apply -f .\kubernetes\deployments.yml -n apps
kubectl apply -f .\kubernetes\services.yml -n apps
kubectl rollout status deployment/productpage -n apps --timeout=180s

kubectl delete job k6-load-generator -n apps --ignore-not-found=true
kubectl apply -f .\kubernetes\k6-job.yml
kubectl wait --for=condition=complete job/k6-load-generator -n apps --timeout=180s

kubectl logs -n apps -l app=productpage --tail=50
kubectl port-forward -n olly svc/loki 3100:3100
```

W Grafanie (Explore -> Loki) użyj:
`{job="loki.source.kubernetes.bookinfo"}`

### K6

Jako k6 użyliśmy grafana:k6 dostępego na docker hub.

### Grafana na kubernetesie
1. Należy pobrać [helm](https://helm.sh/docs/intro/install/). Na windows: ` winget install Helm.Helm `.
	- note: jeżeli coś wygląda jakby się nie pobrało to zrestartuj terminal albo: `helm repo update`
2. Następnie wykonać:
- `helm repo add grafana https://grafana.github.io/helm-charts`
- `helm install grafana grafana/grafana -n olly --create-namespace`
- `kubectl port-forward -n olly svc/grafana 3000:80`
Po wykonaniu pierwszej komendy powinny pojawić się instrukcje do pozyskania hasła. Grafana dostępna będzie pod http://localhost:3000/. UWAGA! Namespace to olly, a nie apps.
- duża szansa że pozyskanie hasła nie zadziała na Windowsie bo komendy są na bash, wtedy należy: `kubectl get secrets -n olly`, co zwróci:

```
NAME                            TYPE                 DATA   AGE
grafana                         Opaque               3      19m <- o to chcemy
sh.helm.release.v1.grafana.v1   helm.sh/release.v1   1      19m
```

W powershellu wykonujemy:

```
[System.Text.Encoding]::UTF8.GetString(
  [System.Convert]::FromBase64String(
    (kubectl get secret grafana -n olly -o jsonpath="{.data.admin-password}")
  )
)
```
Z uzyskanym hasłem możemy zalogować się do lokalnej grafany, username to `admin`. 

### Dodanie Prometheus + Loki
``` Zainstaluj prometheus
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
```
``` Dodaj do namespace olly
helm install monitoring prometheus-community/kube-prometheus-stack -n olly
```
``` Zainstaluj loki (log storage)
helm install loki grafana/loki-stack -n olly `
  --set loki.image.tag=2.9.8 `
  --set promtail.enabled=false `
  --set fluent-bit.enabled=false `
  --set grafana.enabled=false
```

W Alloy logi są wysyłane do: `http://loki.olly:3100/loki/api/v1/push`.

```Dodaj alloy do klastra
make add-alloy
```
```Zainstaluj alloy
 helm upgrade --install alloy grafana/alloy -n olly --create-namespace `
   --set alloy.configMap.create=false `
   --set alloy.configMap.name=alloy-config `
   --set alloy.configMap.key=config.alloy `
   --set controller.type=deployment
```
```Jeżeli trzeba zresartuj alloy
kubectl rollout restart deployment alloy -n olly
```
```Zobacz czy działa
kubectl rollout status deployment/alloy -n olly --timeout=180s
```

### Dodanie loki
```
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm upgrade --install loki grafana/loki-stack -n olly --create-namespace `
  --set loki.image.tag=2.9.8 `
  --set promtail.enabled=false `
  --set fluent-bit.enabled=false `
  --set grafana.enabled=false

kubectl apply --dry-run=client -f .\kubernetes\alloy-config.yml -n olly
kubectl apply -f .\kubernetes\alloy-config.yml -n olly

kubectl rollout restart deployment/alloy -n olly
kubectl rollout status deployment/alloy -n olly --timeout=180s

kubectl wait --for=condition=Ready pod/loki-0 -n olly --timeout=180s
kubectl logs -n olly deployment/alloy -c alloy --since=2m --tail=200
```
```Zrestartuj k6 żeby logi zaczęły wpływać do loki
kubectl delete job k6-load-generator -n apps --ignore-not-found=true
 kubectl apply -f .\kubernetes\k6-job.yml
```
