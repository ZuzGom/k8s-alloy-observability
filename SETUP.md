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
Do zarządzania wszystkimi serwisami używamy kubernetesa.

### Przykładowa aplikacji
Na ten moment będziemy używać przykładowej publiczej aplikacji: [repo](https://github.com/gitopsbook/sample-app-deployment/tree/master). W przyszłości zastąpimy ją aplikacją o bardziej złożonym api.

### K6
Jako k6 użyliśmy grafana:k6 dostępego na docker hub.