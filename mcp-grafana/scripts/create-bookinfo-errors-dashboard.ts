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
    title: "Bookinfo Errors (Loki)",
    uid: "bookinfo-errors",
    folder: "Observability",
    overwrite: true,
    tags: ["loki", "bookinfo", "errors"],
    panels: [
      {
        title: "Error log rate",
        queryType: "loki",
        datasourceUid: "loki",
        expr: 'sum by (app) (rate({job="loki.source.kubernetes.bookinfo"} |~ "(?i)error|exception|fail|warn" [5m]))',
      },
      {
        title: "Bookinfo error logs",
        queryType: "loki",
        datasourceUid: "loki",
        expr: '{job="loki.source.kubernetes.bookinfo"} |~ "(?i)error|exception|fail|warn"',
      },
      {
        title: "Errors by service (productpage)",
        queryType: "loki",
        datasourceUid: "loki",
        expr: '{job="loki.source.kubernetes.bookinfo", app="productpage"} |~ "(?i)error|exception|fail|warn"',
      },
      {
        title: "Errors by service (details)",
        queryType: "loki",
        datasourceUid: "loki",
        expr: '{job="loki.source.kubernetes.bookinfo", app="details"} |~ "(?i)error|exception|fail|warn"',
      },
      {
        title: "Errors by service (ratings)",
        queryType: "loki",
        datasourceUid: "loki",
        expr: '{job="loki.source.kubernetes.bookinfo", app="ratings"} |~ "(?i)error|exception|fail|warn"',
      },
      {
        title: "Errors by service (reviews)",
        queryType: "loki",
        datasourceUid: "loki",
        expr: '{job="loki.source.kubernetes.bookinfo", app="reviews"} |~ "(?i)error|exception|fail|warn"',
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
