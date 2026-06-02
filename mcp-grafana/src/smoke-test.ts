import { GrafanaClient } from "./grafana-client.js";

async function smokeTest() {
  const password = process.env.GRAFANA_PASSWORD;
  if (!password) {
    throw new Error("Set GRAFANA_PASSWORD before running smoke test");
  }

  const client = new GrafanaClient({
    url: process.env.GRAFANA_URL ?? "http://127.0.0.1:3000",
    user: process.env.GRAFANA_USER ?? "admin",
    password,
  });

  const health = await client.health();
  console.log("health:", health);

  const datasources = await client.listDatasources();
  console.log(
    "datasources:",
    datasources.map((ds) => ({ uid: ds.uid, name: ds.name, type: ds.type })),
  );

  const suggestion = await client.suggestQueries("show bookinfo error logs");
  console.log("suggestion:", JSON.stringify(suggestion, null, 2));

  const dashboard = await client.createDashboardFromPrompt("bookinfo error logs dashboard", {
    title: "MCP Smoke Test Bookinfo Errors",
    validate_queries: true,
  });
  console.log("dashboard:", JSON.stringify(dashboard, null, 2));
}

smokeTest().catch((error) => {
  console.error(error);
  process.exit(1);
});
