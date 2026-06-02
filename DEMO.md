## Running queries

- Use Grafana MCP to check health and list all configured datasources with their uids.
- Use get_observability_context and summarize known Loki jobs, Bookinfo apps, namespaces, and example queries for this repo.
- List all Loki label names, then show values for the job, app, and namespace labels.
- List available Prometheus metric names and show label values for namespace and pod in Prometheus.
- Run LogQL for Bookinfo logs from the last 15 minutes and return 10 sample log lines: `{job="loki.source.kubernetes.bookinfo"}`
- Run LogQL for k6 logs from the last 15 minutes and return 10 sample lines: `{job="loki.source.kubernetes.k6"}`
- Run LogQL: `sum by (job) (rate({job=~"loki.source.kubernetes.+"}[5m]))` and explain the log rate per job.
- Run LogQL: `sum by (app) (count_over_time({job="loki.source.kubernetes.bookinfo"}[5m]))` and summarize log volume per Bookinfo service.
- Run LogQL for Bookinfo startup and info logs: `{job="loki.source.kubernetes.bookinfo"} |~ "(?i)info|audit|starting|listening"`
- Run PromQL `up` and list which scrape targets are healthy in the cluster.
- Run PromQL: `sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="apps"}[5m]))` and rank Bookinfo pods by CPU.
- Run PromQL: `sum by (pod) (container_memory_working_set_bytes{namespace="apps"})` and rank Bookinfo pods by memory.
- List Prometheus metrics matching `container_cpu` or `container_memory` and run a query for the top consumers in the apps namespace.
- Run PromQL: `kube_pod_container_status_restarts_total{namespace="apps"}` and report restart counts for Bookinfo pods.
- List Grafana datasources and confirm whether a trace datasource (Tempo/Jaeger) exists.
- Search dashboards for logs and metrics. List titles, uids, and URLs.
- Get all panel queries from dashboard uid `bookinfo-logs` and summarize each panel.
- Get all panel queries from dashboard uid `logs-count` and summarize each panel.
- Suggest Grafana queries for "Bookinfo log volume by app" and validate them against Loki.
- Suggest Grafana queries for "CPU and memory for Bookinfo pods" and validate them against Prometheus.

## Creating dashboards

- Create a logs count dashboard in Observability with stat panels for total/Bookinfo/k6 logs and timeseries for log rate by job. Return the dashboard URL.
- Create a dashboard for Bookinfo and k6 raw logs with one logs panel per job. Return the dashboard URL.
- Create a Prometheus dashboard for CPU and memory usage of Bookinfo pods in the apps namespace. Return the dashboard URL.
- Create a dashboard from prompt: "Bookinfo pod CPU and memory in apps namespace from Prometheus". Return the dashboard URL.
- Create a dashboard from prompt: "Bookinfo and k6 log volume over time with count by app". Return the dashboard URL.
- List Loki jobs, then create a logs count dashboard; if k6 job is missing, tell me to run make restart-k6.
- Build a dashboard from prompt: "Bookinfo observability overview — log rate by app plus container CPU and memory for apps namespace". Return the URL.
