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

```1. Wdróż cały stack (aplikacja, Loki, Prometheus, Grafana, Alloy, k6, MCP)
make deploy
```
```2. W osobnym terminalu — tunel do Grafany (zostaw otwarty; MCP łączy się z localhost:3000)
make port-forward-grafana
```

```3. Zatwierdź MCP w Cursor CLI (jednorazowo). Jeżeli nie zadziała dodaj flage --force
make enable-mcp-grafana
```

4. Zrestartuj Cursor IDE albo cursor CLI. Po restarcie Cursora serwer `grafana-query` powinien być widoczny w **Settings → MCP** jako połączony.

5. Sprawdź, czy wszystko działa (opcjonalnie)
make verify-mcp-grafana
make verify-loki

```6. Uzyskaj hasło do grapfany i wklej je do .env.example
make grafana-password
```
```5 Uruchom agenta za pomocą CLI (lub w IDE):
 agent-mcp PROPMPT="twój prompt"
```

### Przykładowe prompty w Cursorze
- „Sprawdź health Grafany i wypisz datasources.”
- „Create a Grafana dashboard for Bookinfo error logs.”
- „List Loki job labels and show log volume by app.”

Więcej promptów demo: [`DEMO.md`](DEMO.md).

## Inne komendy

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

## Rozwiązywanie problemów

| Objaw | Rozwiązanie |
|-------|-------------|
| Puste dashboardy / brak logów | `make restart-k6`, zakres czasu Last 15 min |
| Grafana niedostępna dla MCP | `make port-forward-grafana` w osobnym terminalu |
| `grafana-query: not loaded` | `make enable-mcp-grafana`, zrestartuj Cursor |
| `Connection failed` (MCP) | `make setup-mcp-grafana` ponownie |
| `No MCP servers configured` (CLI spoza repo) | `make setup-mcp-grafana` |
| Bookinfo nie odpowiada | `make status`, ewentualnie `make delete && make deploy` |
