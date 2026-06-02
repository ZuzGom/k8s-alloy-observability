# Grafana MCP Demo Prompts

Example prompts that showcase what the `grafana-query` MCP server can do in this repository.

Use them in **Cursor IDE** (Agent chat) or via **Cursor CLI**:

```powershell
make agent-grafana PROMPT="your prompt here"
# alias:
make agent-mcp PROMPT="your prompt here"
```

Equivalent CLI command:

```powershell
agent -p --trust --force --approve-mcps "your prompt here"
```

## Before you demo

1. Cluster running: `make deploy` (or at least Grafana + Loki + Alloy + Bookinfo)
2. Grafana reachable on http://127.0.0.1:3000 (port-forward already running is fine)
3. MCP configured: `make setup-mcp-grafana` and `make enable-mcp-grafana`
4. MCP ready: `agent mcp list` → `grafana-query: ready`
5. Fresh log data (optional but recommended): `make restart-k6`

Quick check:

```powershell
make verify-mcp-grafana
```

---

## 1. Connectivity and project context

**MCP tools:** `grafana_health`, `get_observability_context`, `list_datasources`

### Prompt A — health check

```
Use Grafana MCP to check health and list all configured datasources with their uids.
```

**Expected:** Grafana version, Loki uid `loki`, Prometheus uid `prometheus`.

### Prompt B — project defaults

```
Use get_observability_context and summarize known Loki jobs, Bookinfo apps, and example LogQL queries for this repo.
```

**Expected:** `loki.source.kubernetes.bookinfo`, `loki.source.kubernetes.k6`, sample queries.

---

## 2. Discover live telemetry metadata

**MCP tools:** `loki_label_names`, `loki_label_values`, `prometheus_metric_names`, `prometheus_label_values`

### Prompt C — Loki labels

```
List all Loki label names, then show values for the job label. Tell me which jobs are actively receiving logs.
```

**Expected:** labels like `job`, `app`, `namespace`; job values include bookinfo (and k6 after `make restart-k6`).

### Prompt D — Prometheus metrics

```
List available Prometheus metric names (limit 20) and show label values for namespace in Prometheus.
```

**Expected:** Kubernetes / app metrics; namespaces like `apps` and `olly`.

---

## 3. Run live queries

**MCP tools:** `run_loki_query`, `run_prometheus_query`, `suggest_grafana_queries`

### Prompt E — Bookinfo logs

```
Run a LogQL query for Bookinfo logs from the last 15 minutes and show 10 sample log lines.
Use: {job="loki.source.kubernetes.bookinfo"}
```

**Expected:** log lines from productpage, details, ratings, or reviews.

### Prompt F — error logs

```
Suggest LogQL queries for Bookinfo error logs, validate one against live data, and show sample results.
```

**Expected:** queries with `|~ "(?i)error|exception|fail"` and sample matches (if any exist).

### Prompt G — log volume

```
Run a LogQL metric query: sum(count_over_time({job=~"loki.source.kubernetes.+"}[5m])) and explain the result.
```

**Expected:** numeric log count for the last 5 minutes.

### Prompt H — Prometheus CPU

```
Run PromQL to show CPU usage for pods in the apps namespace over the last hour. Use suggest_grafana_queries if needed.
```

**Expected:** timeseries or instant values from Prometheus.

---

## 4. Explore existing dashboards

**MCP tools:** `search_dashboards`, `get_dashboard_queries`

### Prompt I — find dashboards

```
Search Grafana dashboards for "logs" and "bookinfo". List titles, uids, and URLs.
```

**Expected:** dashboards such as **Bookinfo Logs (Loki)**, **Logs Count (Loki)**.

### Prompt J — reuse panel queries

```
Get all panel queries from the dashboard uid bookinfo-logs and summarize what each panel shows.
```

**Expected:** LogQL for Bookinfo and k6 log streams.

---

## 5. Create dashboards from prompts

**MCP tools:** `create_dashboard_from_prompt`, `create_dashboard`

### Prompt K — logs count dashboard

```
List Loki jobs, then create a logs count dashboard in the Observability folder with stat panels for total/Bookinfo/k6 logs and timeseries for log rate by job. Return the dashboard URL.
```

**Expected:** dashboard uid `logs-count` or similar; URL like http://127.0.0.1:3000/d/logs-count/...

### Prompt L — error dashboard

```
Create a Grafana dashboard for Bookinfo error and warning logs. Include a log rate timeseries by app and raw error log panels for each Bookinfo service.
```

**Expected:** new dashboard in Observability; panels for productpage, details, ratings, reviews.

### Prompt M — mixed observability

```
Create a dashboard from prompt: "bookinfo logs and k6 traffic with log volume over time". Validate queries against live data before creating.
```

**Expected:** multi-panel dashboard using both Loki jobs.

---

## 6. End-to-end demo script (presentation flow)

Run in order for a live demo (~5 minutes):

```powershell
make restart-k6

make agent-grafana PROMPT="Check Grafana health and list Loki job label values"

make agent-grafana PROMPT="Run LogQL for bookinfo logs from the last 15 minutes and show 5 sample lines"

make agent-grafana PROMPT="Search dashboards for logs count and return the dashboard URL if it exists; if missing, create it"

make agent-grafana PROMPT="Suggest PromQL for pod CPU in apps namespace, run it, and summarize the top consumers"
```

---

## 7. Cursor IDE prompts (same text, no Makefile)

Open this repo in Cursor, enable MCP `grafana-query`, then paste any prompt above into **Agent** chat.

Examples:

- *"Use Grafana MCP to list Loki jobs and create a logs count dashboard"*
- *"What Bookinfo error logs appeared in the last hour?"*
- *"Build a Prometheus dashboard for CPU usage in the apps namespace"*

---

## 8. Troubleshooting during demo

| Problem | Fix |
|---------|-----|
| Empty Loki results | `make restart-k6`, set Grafana time range to Last 15 minutes |
| `Connection failed` (MCP) | `make setup-mcp-grafana`, ensure port 3000 is forwarded |
| Tools blocked | Add `--force` or use `make agent-grafana` (includes it) |
| Only bookinfo job, no k6 | k6 is a 30s Job — run `make restart-k6` before querying |

---

## MCP tools reference

| Tool | Demo section |
|------|----------------|
| `grafana_health` | 1 |
| `get_observability_context` | 1 |
| `list_datasources` | 1 |
| `loki_label_names` / `loki_label_values` | 2 |
| `prometheus_metric_names` / `prometheus_label_values` | 2 |
| `run_loki_query` | 3 |
| `run_prometheus_query` | 3 |
| `suggest_grafana_queries` | 3 |
| `search_dashboards` | 4 |
| `get_dashboard_queries` | 4 |
| `create_dashboard_from_prompt` | 5 |
| `create_dashboard` | 5 |

More setup details: [SETUP.md](SETUP.md) · MCP server docs: [mcp-grafana/README.md](mcp-grafana/README.md)
