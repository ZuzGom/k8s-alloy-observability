# Setup

Instrukcja uruchomienia klastra, Grafany i integracji MCP z Cursorem.

## Wymagania
Potrzebny jest odpalony Docker, Minikube działa lokalnie na Dockerze.

| Narzędzie | Setup |
|-----------|----------------------|
| [Minikube](https://minikube.sigs.k8s.io/docs/start/) | `minikube start` |
| kubectl | Dołączony do Minikube |
| [Helm](https://helm.sh/docs/intro/install/) | `winget install Helm.Helm` |
| Node.js + npm | [nodejs.org](https://nodejs.org/) |
| Cursor | IDE + opcjonalnie CLI (`agent`) |

Upewnij się, że kubectl wskazuje na Minikube:

```powershell
kubectl config use-context minikube
```

## Szybki start

```powershell
# 1. Wdróż cały stack (aplikacja, Loki, Prometheus, Grafana, Alloy, k6, MCP)
make deploy

# 2. W osobnym terminalu — tunel do Grafany (zostaw otwarty; MCP łączy się z localhost:3000)
make port-forward-grafana

# 3. Zatwierdź MCP w Cursor CLI (jednorazowo)
make enable-mcp-grafana

# 4. Zrestartuj Cursor IDE

# 5. Sprawdź, czy wszystko działa
make verify-mcp-grafana
make verify-loki
```

`make deploy` automatycznie uruchamia `make setup-mcp-grafana`, które:
- instaluje zależności npm w `mcp-grafana/`,
- zapisuje konfigurację MCP do `.cursor/mcp.json` i `~/.cursor/mcp.json`,
- zapisuje hasło Grafany do `~/.cursor/grafana-query.env`.

Po restarcie Cursora serwer `grafana-query` powinien być widoczny w **Settings → MCP** jako połączony.

### Dostęp do Grafany

| Metoda | Komenda | URL |
|--------|---------|-----|
| Port-forward (zalecane dla MCP) | `make port-forward-grafana` | http://localhost:3000 |
| Minikube NodePort | `make open-grafana` | URL zwrócony przez minikube (port 30300) |

Login: `admin` / hasło: `make grafana-password`

W folderze **Observability** są gotowe dashboardy: **Bookinfo Logs (Loki)** i **Logs Count (Loki)**.

### Przykładowe prompty w Cursorze

- „Sprawdź health Grafany i wypisz datasources.”
- „Create a Grafana dashboard for Bookinfo error logs.”
- „List Loki job labels and show log volume by app.”

Więcej promptów demo: [`DEMO.md`](DEMO.md).

### Cursor CLI (`agent`)

Z katalogu projektu (wymaga działającego port-forward):

```powershell
make agent-grafana PROMPT="List Loki jobs and create a logs count dashboard"
```

Przy pierwszym uruchomieniu: `make enable-mcp-grafana`. W trybie `-p` dodaj `--force` lub użyj targetu `make agent-grafana`, który już go zawiera.

## Codzienne komendy

```powershell
make status              # stan podów w apps i olly
make restart-k6          # nowy ruch HTTP + świeże logi (~30 s)
make verify-loki         # czy Loki widzi joby bookinfo i k6
make fix-dashboard-data  # restart Alloy + k6 + przeładuj dashboardy Grafany
make delete              # usuń cały stack
```

Pełna lista targetów: `make help`.

## Architektura

Dwa namespace'y:

- **`apps`** — Bookinfo (productpage, details, ratings, reviews) + Job k6
- **`olly`** — Loki, Prometheus, Grafana, Alloy

Alloy zbiera logi z podów i wysyła je do Loki (`http://loki.olly:3100`). Grafana ma skonfigurowane datasource'y Loki i Prometheus.

k6 działa jako **jednorazowy Job** (~30 s). Po zakończeniu pod ma status `Completed` — to normalne. Aby odświeżyć logi: `make restart-k6`. Ustaw w Grafanie zakres **Last 15 minutes**.

W Explore → Loki:

```logql
{job="loki.source.kubernetes.bookinfo"}
```

## Rozwiązywanie problemów

| Objaw | Rozwiązanie |
|-------|-------------|
| Puste dashboardy / brak logów | `make restart-k6`, zakres czasu Last 15 min |
| Grafana niedostępna dla MCP | `make port-forward-grafana` w osobnym terminalu |
| `grafana-query: not loaded` | `make enable-mcp-grafana`, zrestartuj Cursor |
| `Connection failed` (MCP) | `make setup-mcp-grafana` ponownie |
| `No MCP servers configured` (CLI spoza repo) | `make setup-mcp-grafana` |
| Bookinfo nie odpowiada | `make status`, ewentualnie `make delete && make deploy` |

Test połączenia z aplikacją Bookinfo:

```powershell
kubectl run curl -n apps --rm -it --image=curlimages/curl -- sh
# w shellu: curl http://productpage:9080/productpage
```

## Instalacja komponentów osobno

Wszystko poniżej jest już częścią `make deploy`. Użyj tych targetów tylko przy częściowej reinstalacji:

| Komponent | Target |
|-----------|--------|
| Namespace'y + Bookinfo | `make deploy-app` |
| Loki | `make install-loki` |
| Prometheus | `make install-prometheus` |
| Grafana | `make install-grafana` |
| Alloy | `make install-alloy` |
| MCP (npm + konfiguracja Cursor) | `make setup-mcp-grafana` |

Szczegóły MCP: [`mcp-grafana/README.md`](mcp-grafana/README.md).
