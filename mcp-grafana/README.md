# Grafana Query MCP Server

MCP server (`grafana-query`) that lets Cursor discover Grafana datasources, run LogQL/PromQL, and create dashboards from natural-language prompts.

## Setup

From the repository root (after `make deploy` or with Grafana running):

```powershell
make port-forward-grafana   # separate terminal — MCP uses http://127.0.0.1:3000
make setup-mcp-grafana      # npm install + Cursor MCP config + credentials
make enable-mcp-grafana   # approve server in Cursor CLI (one-time)
```

Restart Cursor IDE. Verify: `make verify-mcp-grafana`.

Credentials are stored in `~/.cursor/grafana-query.env` (not in the repo). The launcher `scripts/run-mcp.mjs` reads that file automatically.

## Tools

| Tool | Purpose |
|------|---------|
| `grafana_health` | Check Grafana connectivity |
| `get_observability_context` | Project defaults (Bookinfo jobs, namespaces, example queries) |
| `list_datasources` | List Loki/Prometheus datasource uids |
| `loki_label_names` / `loki_label_values` | Inspect live Loki labels |
| `run_loki_query` | Execute LogQL and return sample results |
| `prometheus_metric_names` / `prometheus_label_values` | Inspect Prometheus metadata |
| `run_prometheus_query` | Execute PromQL |
| `search_dashboards` / `get_dashboard_queries` | Reuse queries from existing dashboards |
| `suggest_grafana_queries` | Build query suggestions from a prompt |
| `create_dashboard` | Create a dashboard from explicit panel definitions |
| `create_dashboard_from_prompt` | Suggest, validate, create dashboard, return URL |

## Example prompts

- "Create a Grafana dashboard for Bookinfo error logs."
- "List Loki job labels and show log volume by app."
- "Build a Prometheus dashboard for CPU usage in the apps namespace."

More demo prompts: [`../DEMO.md`](../DEMO.md).

## Development

```powershell
cd mcp-grafana
npm install
npm run check    # TypeScript check
npm start        # run MCP server directly (requires GRAFANA_PASSWORD)
```

Environment variables (optional overrides):

| Variable | Default |
|----------|---------|
| `GRAFANA_URL` | `http://127.0.0.1:3000` |
| `GRAFANA_USER` | `admin` |
| `GRAFANA_PASSWORD` | from `~/.cursor/grafana-query.env` |

See also: [`../SETUP.md`](../SETUP.md).
