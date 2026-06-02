import { GrafanaClient } from "../src/grafana-client.js";

async function main() {
  const password = process.env.GRAFANA_PASSWORD;
  if (!password) {
    throw new Error("Set GRAFANA_PASSWORD before running");
  }

  const client = new GrafanaClient({
    url: process.env.GRAFANA_URL ?? "http://127.0.0.1:3000",
    user: process.env.GRAFANA_USER ?? "admin",
    password,
  });

  const health = await client.health();
  if (!health.ok) {
    throw new Error(health.message);
  }

  const result = await client.createDashboardFromPanels({
    title: "Logs Count (Loki)",
    uid: "logs-count",
    folder: "Observability",
    overwrite: true,
    tags: ["loki", "logs", "count"],
    panels: [
      {
        title: "Total logs",
        queryType: "loki",
        panelType: "stat",
        datasourceUid: "loki",
        expr: 'sum(count_over_time({job=~"loki.source.kubernetes.+"}[$__range]))',
        gridPos: { h: 4, w: 8, x: 0, y: 0 },
      },
      {
        title: "Bookinfo logs",
        queryType: "loki",
        panelType: "stat",
        datasourceUid: "loki",
        expr: 'sum(count_over_time({job="loki.source.kubernetes.bookinfo"}[$__range]))',
        gridPos: { h: 4, w: 8, x: 8, y: 0 },
      },
      {
        title: "k6 logs",
        queryType: "loki",
        panelType: "stat",
        datasourceUid: "loki",
        expr: 'sum(count_over_time({job="loki.source.kubernetes.k6"}[$__range]))',
        gridPos: { h: 4, w: 8, x: 16, y: 0 },
      },
      {
        title: "Log rate by job",
        queryType: "loki",
        panelType: "timeseries",
        datasourceUid: "loki",
        expr: 'sum by (job) (rate({job=~"loki.source.kubernetes.+"}[5m]))',
        gridPos: { h: 8, w: 24, x: 0, y: 4 },
      },
      {
        title: "Bookinfo log count by app",
        queryType: "loki",
        panelType: "timeseries",
        datasourceUid: "loki",
        expr: 'sum by (app) (count_over_time({job="loki.source.kubernetes.bookinfo"}[5m]))',
        gridPos: { h: 8, w: 12, x: 0, y: 12 },
      },
      {
        title: "Total log volume",
        queryType: "loki",
        panelType: "timeseries",
        datasourceUid: "loki",
        expr: 'sum(count_over_time({job=~"loki.source.kubernetes.+"}[5m]))',
        gridPos: { h: 8, w: 12, x: 12, y: 12 },
      },
    ],
  });

  console.log(JSON.stringify(result, null, 2));
  console.log(`Dashboard URL: ${client.dashboardUrl(result.dashboard.uid)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
