# k8s-alloy-observability
Kubernetes observability setup using Grafana Alloy as an OpenTelemetry Collector to gather, process, and export telemetry data from cluster workloads.

# Wstęp i Cele Projektu
Ten projekt demonstruje nowoczesne podejście do obserwacyjności w środowisku Kubernetes, wykorzystując Grafana Alloy jako centralny procesor danych oraz LLM (Large Language Models) do inteligentnej analizy i wizualizacji telemetrii. Celem systemu jest skrócenie czasu od wystąpienia incydentu do jego wizualizacji poprzez automatyzację zapytań analitycznych. System pozwala deweloperowi na zadawanie pytań w języku naturalnym, które są tłumaczone na techniczne zapytania i natychmiastowo wyświetlane w Grafanie.

# Architektura Systemu (High-Level)
Poniższy schemat przedstawia architektóre systemu:

<!-- <img width="1060" height="637" alt="image" src="https://github.com/user-attachments/assets/81be87bf-4af3-474e-a78a-c93d434de5f6" /> -->
![diagram](docs/diagram.svg)

Opis Komponentów Architektury:
1. Traffic Generation (User / k6): Symuluje ruch użytkowników oraz obciążenie HTTP, generując realne dane procesowe w aplikacji.
2. Sample Application: Konteneryzowana aplikacja w K8s z zainstrumentowanym OpenTelemetry SDK, wysyłająca surowe dane telemetryczne.
3. Grafana Alloy: Odbiera dane (OTLP).
4. Przetwarza je i przekazuje do odpowiednich baz danych.
6. Observability Data Storage:
- Prometheus: Składowanie metryk wydajnościowych.
- Loki: Agregacja i przechowywanie logów aplikacji.
- Tempo: Przechowywanie śladów (traces) do analizy rozproszonej.
7. AI Analysis Layer:
- Deweloper wysyła zapytanie w języku naturalnym (np. "Pokaż mi błędy 500 z ostatniej godziny i powiązane z nimi ślady").
- MCP Server (`mcp-grafana/`) dostarcza kontekst telemetryczny z Grafany do LLM w Cursorze.
- LLM generuje gotowe zapytania (PromQL/LogQL).
8. Grafana Visualization: wygenerowane przez AI zapytania są uruchamiane, tworząc dynamiczne dashboardy i wizualizacje.

# Grafana Query MCP (`mcp-grafana/`)

Serwer [Model Context Protocol](https://modelcontextprotocol.io/) (`grafana-query`), który łączy Cursor (lub Cursor CLI `agent`) z lokalną instancją Grafany. Agent może odkrywać datasources, przeglądać etykiety Loki i metryki Prometheusa, wykonywać zapytania LogQL/PromQL oraz tworzyć dashboardy - bez ręcznego pisania JSON-a paneli.

## Jak to działa

1. Cursor uruchamia proces z `.cursor/mcp.json` → `mcp-grafana/scripts/run-mcp.mjs`.
2. Wrapper ładuje `GRAFANA_PASSWORD` (zmienna środowiskowa lub `~/.cursor/grafana-query.env`) i startuje serwer MCP przez `tsx src/index.ts`.
3. `index.ts` nasłuchuje na **stdio** (transport MCP) i obsługuje wywołania narzędzi (`CallTool`).
4. `grafana-client.ts` wykonuje żądania HTTP do Grafany (`http://127.0.0.1:3000` po `make port-forward-grafana`): health, datasources, proxy Loki/Prometheus, `POST /api/ds/query`, tworzenie dashboardów.
5. `dashboard-builder.ts` składa odpowiedź w JSON dashboardu Grafany (panele logs / timeseries / stat).

Logika sugerowania zapytań (`suggest_grafana_queries`, `create_dashboard_from_prompt`) jest **regułowa** (słowa kluczowe w prompcie + odkryte etykiety z klastra), a nie osobnym modelem wewnątrz serwera - tłumaczenie języka naturalnego robi LLM w Cursorze, MCP dostarcza dane i API.

## Struktura katalogu

```
mcp-grafana/
├── package.json
├── README.md              # szczegóły instalacji i narzędzi
├── src/
│   ├── index.ts           # definicje narzędzi MCP i handlery
│   ├── grafana-client.ts  # klient HTTP Grafany + kontekst projektu (Bookinfo, k6, joby Loki)
│   └── dashboard-builder.ts
└── scripts/
    ├── run-mcp.mjs        # punkt wejścia dla Cursor
    ├── run-mcp.ps1
    └── setup-global-mcp.ps1
```

## Konfiguracja

```powershell
make port-forward-grafana   # Grafana na localhost:3000
make setup-mcp-grafana      # npm install, ~/.cursor/mcp.json, hasło
make enable-mcp-grafana     # zatwierdzenie serwera w Cursor CLI
```

Więcej: `mcp-grafana/README.md`, `SETUP.md` (sekcja MCP).

## Narzędzia MCP

| Narzędzie | Opis |
|-----------|------|
| `grafana_health` | Sprawdzenie połączenia z Grafaną |
| `get_observability_context` | Kontekst projektu: namespace'y, joby Loki, przykładowe LogQL/PromQL |
| `list_datasources` | Lista datasource'ów (uid, typ) |
| `loki_label_names` / `loki_label_values` | Etykiety Loki z klastra |
| `run_loki_query` | Wykonanie LogQL, próbka wyników |
| `prometheus_metric_names` / `prometheus_label_values` | Metadane Prometheusa |
| `run_prometheus_query` | Wykonanie PromQL |
| `search_dashboards` / `get_dashboard_queries` | Wyszukiwanie dashboardów i odczyt zapytań z paneli |
| `suggest_grafana_queries` | Propozycje LogQL/PromQL z promptu (heurystyki + live labels) |
| `create_dashboard` | Dashboard z jawnie podanymi panelami |
| `create_dashboard_from_prompt` | Sugestia → walidacja zapytań → utworzenie dashboardu, URL |
