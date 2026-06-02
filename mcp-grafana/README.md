# Grafana Query MCP Server

MCP server that lets Cursor discover Grafana datasources, inspect live Loki/Prometheus data, generate queries from natural-language prompts, and **create Grafana dashboards automatically**.

## Prerequisites

1. Grafana reachable locally (usually `make port-forward-grafana`).
2. Grafana admin password available as `GRAFANA_PASSWORD`.

## Setup

```powershell
make setup-mcp-grafana   # npm install + ~/.cursor/mcp.json + GRAFANA_PASSWORD
make enable-mcp-grafana  # agent mcp enable grafana-query
```

Or install dependencies only (IDE project config in `.cursor/mcp.json`):

```powershell
cd mcp-grafana
npm install
```

Set the password in your user environment (recommended):

```powershell
$env:GRAFANA_PASSWORD = (make grafana-password)
[System.Environment]::SetEnvironmentVariable("GRAFANA_PASSWORD", $env:GRAFANA_PASSWORD, "User")
```

Restart Cursor after setting the variable so `.cursor/mcp.json` can read `${env:GRAFANA_PASSWORD}`.

Project MCP config lives in `.cursor/mcp.json`.

## Tools exposed to Cursor

| Tool | Purpose |
|------|---------|
| `grafana_health` | Verify Grafana connectivity |
| `get_observability_context` | Project defaults (Bookinfo jobs, namespaces, examples) |
| `list_datasources` | List Loki/Prometheus datasource uids |
| `loki_label_names` / `loki_label_values` | Inspect live Loki labels |
| `run_loki_query` | Execute LogQL and return sample results |
| `prometheus_metric_names` / `prometheus_label_values` | Inspect Prometheus metadata |
| `run_prometheus_query` | Execute PromQL and return sample results |
| `search_dashboards` / `get_dashboard_queries` | Reuse queries from existing dashboards |
| `suggest_grafana_queries` | Build query suggestions from a natural-language prompt |
| `create_dashboard` | Create a dashboard from explicit panel definitions |
| `create_dashboard_from_prompt` | Generate queries, validate them, create a dashboard, return URL |

## Example prompts in Cursor

- "Create a Grafana dashboard for Bookinfo error logs."
- "Use Grafana MCP to dashboard bookinfo logs and k6 traffic."
- "Build a Prometheus dashboard for CPU usage in the apps namespace."

## Manual smoke test

With port-forward running:

```powershell
$env:GRAFANA_PASSWORD = "<password>"
npm run smoke-test
```

The smoke test validates connectivity, query suggestion, and dashboard creation.
