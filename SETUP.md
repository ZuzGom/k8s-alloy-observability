## Uruchomienie localne
### Kubernetes na Minikube
Aby uruchomić kluster należy pobrać [minikube](https://minikube.sigs.k8s.io/docs/start/?arch=%2Fwindows%2Fx86-64%2Fstable%2F.exe+download) oraz uruchomić instancje na dockerze. W pliku Makefile znajdują się 3 targety:

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
Jeżeli nie działa to prawdopodobnie kontener nie chodzi. Użyj `make status` aby sprawdzić czy pod/sample-app-hash ma status running. Jeżeli nie to zrestartuj (`make delete`, `make deploy`)
```
kubectl run curl -n apps --rm -it --image=curlimages/curl -- sh
```

## Opis techniczny komponentów
Do zarządzania wszystkimi serwisami używamy kubernetesa. Aplikacja i część o11y będą w dwóch różnych namespacach: apps, olly.

### Przykładowa aplikacji
Na ten moment będziemy używać przykładowej publiczej aplikacji: [repo](https://github.com/gitopsbook/sample-app-deployment/tree/master). W przyszłości zastąpimy ją aplikacją o bardziej złożonym api.

### K6
Jako k6 użyliśmy grafana:k6 dostępego na docker hub.

### Grafana na kubernetesie
1. Należy pobrać [helm](https://helm.sh/docs/intro/install/). Na windows: ` winget install Helm.Helm `.
2. Następnie wykonać:`helm repo add grafana https://grafana.github.io/helm-charts`. Pojawią się instrukcje do forwardowania portu i pozyskania hasła. Grafana dostępna będzie pod http://localhost:3000/. UWAGA! Namespace to olly, a nie apps.
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
Z uzyskanym hasłem możemy zalogować się do lokalnej grafany 