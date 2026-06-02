## Uruchomienie lokalne

### Kubernetes na Minikube
Aby uruchomić kluster należy pobrać [minikube](https://minikube.sigs.k8s.io/docs/start/?arch=%2Fwindows%2Fx86-64%2Fstable%2F.exe+download) oraz uruchomić instancje na dockerze (`minikube start`). Jeżeli ustawiony jest kubectl config z zajęć to podmień na minikube: `kubectl config use-context minikube`. W pliku Makefile znajdują się 3 targety:

```Deploy całego clustra od 0 (w tym MCP: npm install + ~/.cursor/mcp.json + GRAFANA_PASSWORD)
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

Jako k6 użyliśmy `grafana/k6` dostępnego na Docker Hub.

k6 jest uruchamiany jako **Job Kubernetes** (jednorazowy test ~30 s), a nie ciągły serwis. Po zakończeniu pod ma status `Completed` — to jest oczekiwane zachowanie.

Aby wygenerować nowy ruch i logi:

```
make restart-k6
```

Po restarcie k6 w Loki powinny pojawić się oba joby: `loki.source.kubernetes.bookinfo` i `loki.source.kubernetes.k6` (sprawdź: `make verify-loki`).

### Grafana na kubernetesie

Grafana jest instalowana w namespace `olly` (Helm chart `grafana/grafana`) z gotowym datasource Loki i dashboardem logów Bookinfo.

1. Należy pobrać [helm](https://helm.sh/docs/intro/install/). Na windows: `winget install Helm.Helm`.
2. Po `make deploy` uruchom Grafanę jedną z metod:

**Opcja A (zalecana na Minikube):**
```
make open-grafana
```
Minikube zwróci URL (np. `http://127.0.0.1:xxxxx`) i otworzy tunel do NodePort `30300`.

**Opcja B (port-forward):**
```
make port-forward-grafana
```
Grafana dostępna pod http://localhost:3000/

3. Hasło admina:
```
make grafana-password
```
Username: `admin`.

4. Sprawdzenie czy Loki ma logi:
```
make verify-loki
```
Powinno zwrócić joby: `loki.source.kubernetes.bookinfo` i `loki.source.kubernetes.k6`.

5. W Grafanie (folder **Observability**):
- **Bookinfo Logs (Loki)** — surowe logi Bookinfo i k6
- **Logs Count (Loki)** — liczniki i wykresy wolumenu logów
- Explore → Loki: `{job="loki.source.kubernetes.bookinfo"}`

Jeśli brak logów lub puste dashboardy:
```
make restart-k6
```
Ustaw zakres czasu na **Last 15 minutes** (lub krócej) — k6 generuje dane tylko podczas ~30 s testu. Po restarcie Loki historyczne logi znikają; uruchom k6 ponownie.

**Uwaga:** dashboardy z metrykami typu *log rate* spadną do zera kilka minut po zakończeniu k6 — to normalne dla jednorazowego Joba.

### Grafana MCP server dla Cursor

Repozytorium zawiera MCP server (`mcp-grafana/`), który pozwala Cursorowi tworzyć zapytania LogQL/PromQL oraz **automatycznie tworzyć dashboardy Grafany** na podstawie promptu użytkownika i danych z Grafany.

**Wymagania:** Node.js + npm, działający klaster, Grafana dostępna lokalnie.

1. Uruchom Grafanę lokalnie (osobny terminal — zostaw otwarty):
```
make port-forward-grafana
```

2. Zainstaluj zależności MCP i zarejestruj serwer globalnie (wymagane dla `agent` spoza katalogu projektu):

`make deploy` robi to automatycznie na końcu. Ręcznie:

```
make setup-mcp-grafana
make enable-mcp-grafana
```

Skrypt `setup-mcp-grafana` zapisuje konfigurację w **obu** miejscach:
- `%USERPROFILE%\.cursor\mcp.json` (CLI spoza projektu)
- `.cursor/mcp.json` w repozytorium (CLI w projekcie + Cursor IDE)

Hasło trafia do `%USERPROFILE%\.cursor\grafana-query.env` (nie do repo).

Alternatywnie tylko zależności (gdy używasz wyłącznie Cursor IDE z `.cursor/mcp.json` w projekcie):
```
make install-mcp-grafana
```

3. Ustaw hasło admina w zmiennej środowiskowej użytkownika Windows (pomijane, jeśli `make setup-mcp-grafana` odczytało je z klastra):
```powershell
[System.Environment]::SetEnvironmentVariable(
  "GRAFANA_PASSWORD",
  (make grafana-password),
  "User"
)
```

4. **Otwórz nowy terminal** (żeby wczytać `GRAFANA_PASSWORD`) i **zrestartuj Cursor**. Konfiguracja MCP jest w `.cursor/mcp.json` — Cursor uruchamia serwer MCP automatycznie, nie trzeba go startować ręcznie.

5. Sprawdź połączenie (opcjonalnie):
```powershell
cd mcp-grafana
$env:GRAFANA_PASSWORD = (make grafana-password)
npm run smoke-test
```

#### Cursor IDE (chat / Agent)

W **Cursor Settings → MCP** upewnij się, że serwer `grafana-query` jest włączony i połączony.

Przykładowe prompty:
- "Create a Grafana dashboard for Bookinfo error logs."
- "Create a dashboard with logs count."
- "List available Loki job labels and validate the query."

#### Cursor CLI (`agent`)

`agent mcp list` czyta `~/.cursor/mcp.json` (globalnie) lub `.cursor/mcp.json` (w katalogu projektu). Jeśli uruchamiasz `agent` spoza repozytorium, najpierw:

```
make setup-mcp-grafana
make enable-mcp-grafana
```

Z katalogu projektu lub po globalnej konfiguracji:

```powershell
# interaktywnie
agent

# jednorazowo — użyj --force (globalny allowlist domyślnie blokuje narzędzia)
agent -p --trust --force --approve-mcps "Create a Grafana dashboard for Bookinfo error logs"
```

Projekt ma `.cursor/cli.json` z dozwolonymi `Shell(**)` i `Mcp(grafana-query, **)`. To **nie zastępuje** `--force` w trybie `-p`; nadal dodawaj `--force` albo ustaw `"approvalMode": "unrestricted"` w `%USERPROFILE%\.cursor\cli-config.json`.

Makefile (prompt jako parametr):

```
make agent-grafana PROMPT="List Loki jobs and create a logs count dashboard"
make agent-mcp PROMPT="Create a dashboard for Bookinfo error logs"
```

Przy pierwszym uruchomieniu MCP wymaga zatwierdzenia:

```powershell
agent mcp enable grafana-query
agent mcp list
agent mcp list-tools grafana-query
```

Alternatywa: flaga `--approve-mcps` przy każdym uruchomieniu agenta.

**Rozwiązywanie problemów**

| Objaw | Przyczyna | Rozwiązanie |
|-------|-----------|-------------|
| `No MCP servers configured` | Brak `~/.cursor/mcp.json` | `make setup-mcp-grafana` |
| `Connection failed` / `Connection closed` | Stara konfiguracja lub brak hasła | `make setup-mcp-grafana` ponownie |
| MCP `ready`, ale zapytania nie działają | Brak port-forward | `make port-forward-grafana` (osobny terminal) |
| `grafana-query: not loaded` | MCP nie zatwierdzony | `make enable-mcp-grafana` |
| Agent pisze „MCP and shell access were blocked" | CLI w trybie allowlist | Dodaj `--force` do komendy |
| `Invalid project config ... approvalMode` | Zły klucz w `.cursor/cli.json` | Usuń `approvalMode` z pliku projektu; użyj tylko `permissions` |

Sprawdzenie:
```
make verify-mcp-grafana
agent mcp list
```
Oczekiwany wynik: `grafana-query: ready`

#### Bez MCP (skrypty dashboardów)

Jeśli nie używasz Cursora, dashboardy można utworzyć bezpośrednio:

```powershell
$env:GRAFANA_PASSWORD = (make grafana-password)
npx tsx mcp-grafana/scripts/create-logs-count-dashboard.ts
npx tsx mcp-grafana/scripts/create-bookinfo-errors-dashboard.ts
```

Więcej szczegółów: `mcp-grafana/README.md`, przykładowe zmienne: `.env.example`.

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

Loki instalowany przez Makefile używa `kubernetes/loki-values.yml` (m.in. `volume_enabled` dla zapytań metrycznych LogQL w dashboardach).

```
make install-loki
```

Ręczna instalacja (alternatywa):

```
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm upgrade --install loki grafana/loki-stack -n olly --create-namespace `
  -f .\kubernetes\loki-values.yml `
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
