import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { inferPanelType } from "./dashboard-builder.js";
import { GrafanaClient, loadConfig } from "./grafana-client.js";

const client = new GrafanaClient(loadConfig());

const tools = [
  {
    name: "grafana_health",
    description: "Check connectivity to the local Grafana instance.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_observability_context",
    description:
      "Return project-specific observability context: known Loki jobs, Bookinfo apps, namespaces, and example queries for this repository.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_datasources",
    description: "List Grafana datasources (Loki, Prometheus, etc.) with uid, name, and type.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "loki_label_names",
    description: "List available Loki label names from the selected datasource.",
    inputSchema: {
      type: "object",
      properties: {
        datasource_uid: {
          type: "string",
          description: "Grafana datasource uid. Defaults to the Loki datasource.",
        },
      },
    },
  },
  {
    name: "loki_label_values",
    description: "List values for a Loki label (for example job, namespace, pod).",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Label name, e.g. job" },
        datasource_uid: {
          type: "string",
          description: "Grafana datasource uid. Defaults to the Loki datasource.",
        },
      },
      required: ["label"],
    },
  },
  {
    name: "run_loki_query",
    description: "Execute a LogQL query through Grafana and return sample results.",
    inputSchema: {
      type: "object",
      properties: {
        expr: { type: "string", description: "LogQL expression" },
        datasource_uid: {
          type: "string",
          description: "Grafana datasource uid. Defaults to the Loki datasource.",
        },
        limit: { type: "number", description: "Maximum log lines to return (default 20)" },
        range_minutes: {
          type: "number",
          description: "Lookback window in minutes (default 60)",
        },
      },
      required: ["expr"],
    },
  },
  {
    name: "prometheus_metric_names",
    description: "List Prometheus metric names available in Grafana.",
    inputSchema: {
      type: "object",
      properties: {
        datasource_uid: {
          type: "string",
          description: "Grafana datasource uid. Defaults to the Prometheus datasource.",
        },
        limit: { type: "number", description: "Maximum number of metric names to return (default 100)" },
      },
    },
  },
  {
    name: "prometheus_label_values",
    description: "List values for a Prometheus label.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Label name, e.g. namespace or job" },
        datasource_uid: {
          type: "string",
          description: "Grafana datasource uid. Defaults to the Prometheus datasource.",
        },
      },
      required: ["label"],
    },
  },
  {
    name: "run_prometheus_query",
    description: "Execute a PromQL query through Grafana and return sample results.",
    inputSchema: {
      type: "object",
      properties: {
        expr: { type: "string", description: "PromQL expression" },
        datasource_uid: {
          type: "string",
          description: "Grafana datasource uid. Defaults to the Prometheus datasource.",
        },
        range_minutes: {
          type: "number",
          description: "Lookback window in minutes (default 60)",
        },
      },
      required: ["expr"],
    },
  },
  {
    name: "search_dashboards",
    description: "Search Grafana dashboards by title or tag.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search string (optional)" },
      },
    },
  },
  {
    name: "get_dashboard_queries",
    description: "Extract panel queries from an existing Grafana dashboard.",
    inputSchema: {
      type: "object",
      properties: {
        dashboard_uid: { type: "string", description: "Dashboard uid" },
      },
      required: ["dashboard_uid"],
    },
  },
  {
    name: "suggest_grafana_queries",
    description:
      "Suggest LogQL or PromQL queries from a natural-language prompt using live Grafana data and project defaults.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Natural language request, e.g. 'show bookinfo errors from last hour'",
        },
        query_type: {
          type: "string",
          enum: ["auto", "loki", "prometheus"],
          description: "Force Loki or Prometheus, or auto-detect from prompt (default auto).",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "create_dashboard",
    description:
      "Create a Grafana dashboard with explicit panels and queries. Returns the dashboard URL.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Dashboard title" },
        panels: {
          type: "array",
          description: "Panels to create",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              query_type: { type: "string", enum: ["loki", "prometheus"] },
              expr: { type: "string" },
              datasource_uid: { type: "string" },
            },
            required: ["title", "query_type", "expr"],
          },
        },
        folder: {
          type: "string",
          description: "Optional Grafana folder title, e.g. Observability",
        },
        overwrite: {
          type: "boolean",
          description: "Replace an existing dashboard with the same uid if it exists",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional dashboard tags",
        },
      },
      required: ["title", "panels"],
    },
  },
  {
    name: "create_dashboard_from_prompt",
    description:
      "Generate queries from a natural-language prompt, validate them against live Grafana data, create a dashboard automatically, and return its URL. Prefer this when the user asks to visualize or dashboard something.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Natural language request, e.g. 'dashboard for bookinfo errors and k6 logs'",
        },
        title: {
          type: "string",
          description: "Optional dashboard title. Defaults to a title derived from the prompt.",
        },
        folder: {
          type: "string",
          description: "Optional Grafana folder title, e.g. Observability",
        },
        overwrite: {
          type: "boolean",
          description: "Replace an existing dashboard with the same uid if it exists",
        },
        query_type: {
          type: "string",
          enum: ["auto", "loki", "prometheus"],
          description: "Force Loki or Prometheus, or auto-detect from prompt (default auto).",
        },
        validate_queries: {
          type: "boolean",
          description: "Run each query before creating the dashboard (default true).",
        },
      },
      required: ["prompt"],
    },
  },
] as const;

async function resolveLokiUid(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const ds = await client.getDatasourceByType("loki");
  if (!ds) throw new Error("No Loki datasource found in Grafana");
  return ds.uid;
}

async function resolvePrometheusUid(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const ds = await client.getDatasourceByType("prometheus");
  if (!ds) throw new Error("No Prometheus datasource found in Grafana");
  return ds.uid;
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

async function main() {
  const server = new Server(
    {
      name: "grafana-query-mcp",
      version: "1.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "grafana_health":
          return jsonResult(await client.health());

        case "get_observability_context":
          return jsonResult(client.getProjectContext());

        case "list_datasources":
          return jsonResult(await client.listDatasources());

        case "loki_label_names": {
          const input = z.object({ datasource_uid: z.string().optional() }).parse(args ?? {});
          const uid = await resolveLokiUid(input.datasource_uid);
          return jsonResult({ datasource_uid: uid, labels: await client.lokiLabelNames(uid) });
        }

        case "loki_label_values": {
          const input = z
            .object({ label: z.string(), datasource_uid: z.string().optional() })
            .parse(args ?? {});
          const uid = await resolveLokiUid(input.datasource_uid);
          return jsonResult({
            datasource_uid: uid,
            label: input.label,
            values: await client.lokiLabelValues(uid, input.label),
          });
        }

        case "run_loki_query": {
          const input = z
            .object({
              expr: z.string(),
              datasource_uid: z.string().optional(),
              limit: z.number().optional(),
              range_minutes: z.number().optional(),
            })
            .parse(args ?? {});
          const uid = await resolveLokiUid(input.datasource_uid);
          return jsonResult(
            await client.queryLoki(uid, input.expr, input.limit ?? 20, input.range_minutes ?? 60),
          );
        }

        case "prometheus_metric_names": {
          const input = z
            .object({ datasource_uid: z.string().optional(), limit: z.number().optional() })
            .parse(args ?? {});
          const uid = await resolvePrometheusUid(input.datasource_uid);
          const metrics = await client.prometheusMetricNames(uid);
          return jsonResult({
            datasource_uid: uid,
            metrics: metrics.slice(0, input.limit ?? 100),
            total: metrics.length,
          });
        }

        case "prometheus_label_values": {
          const input = z
            .object({ label: z.string(), datasource_uid: z.string().optional() })
            .parse(args ?? {});
          const uid = await resolvePrometheusUid(input.datasource_uid);
          return jsonResult({
            datasource_uid: uid,
            label: input.label,
            values: await client.prometheusLabelValues(uid, input.label),
          });
        }

        case "run_prometheus_query": {
          const input = z
            .object({
              expr: z.string(),
              datasource_uid: z.string().optional(),
              range_minutes: z.number().optional(),
            })
            .parse(args ?? {});
          const uid = await resolvePrometheusUid(input.datasource_uid);
          return jsonResult(
            await client.queryPrometheus(uid, input.expr, input.range_minutes ?? 60),
          );
        }

        case "search_dashboards": {
          const input = z.object({ query: z.string().optional() }).parse(args ?? {});
          return jsonResult(await client.searchDashboards(input.query ?? ""));
        }

        case "get_dashboard_queries": {
          const input = z.object({ dashboard_uid: z.string() }).parse(args ?? {});
          const dashboard = await client.getDashboard(input.dashboard_uid);
          return jsonResult({
            dashboard_uid: input.dashboard_uid,
            queries: client.extractQueriesFromDashboard(dashboard),
          });
        }

        case "suggest_grafana_queries": {
          const input = z
            .object({
              prompt: z.string(),
              query_type: z.enum(["auto", "loki", "prometheus"]).optional(),
            })
            .parse(args ?? {});
          return jsonResult(
            await client.suggestQueries(input.prompt, input.query_type ?? "auto"),
          );
        }

        case "create_dashboard": {
          const input = z
            .object({
              title: z.string(),
              panels: z.array(
                z.object({
                  title: z.string(),
                  query_type: z.enum(["loki", "prometheus"]),
                  expr: z.string(),
                  datasource_uid: z.string().optional(),
                }),
              ),
              folder: z.string().optional(),
              overwrite: z.boolean().optional(),
              tags: z.array(z.string()).optional(),
            })
            .parse(args ?? {});

          const panels = await Promise.all(
            input.panels.map(async (panel) => ({
              title: panel.title,
              queryType: panel.query_type,
              panelType: inferPanelType({
                title: panel.title,
                queryType: panel.query_type,
                expr: panel.expr,
                datasourceUid: panel.datasource_uid ?? "placeholder",
              }),
              expr: panel.expr,
              datasourceUid:
                panel.datasource_uid ??
                (panel.query_type === "loki"
                  ? await resolveLokiUid()
                  : await resolvePrometheusUid()),
            })),
          );

          return jsonResult(
            await client.createDashboardFromPanels({
              title: input.title,
              panels,
              folder: input.folder,
              overwrite: input.overwrite,
              tags: input.tags,
            }),
          );
        }

        case "create_dashboard_from_prompt": {
          const input = z
            .object({
              prompt: z.string(),
              title: z.string().optional(),
              folder: z.string().optional(),
              overwrite: z.boolean().optional(),
              query_type: z.enum(["auto", "loki", "prometheus"]).optional(),
              validate_queries: z.boolean().optional(),
            })
            .parse(args ?? {});

          return jsonResult(
            await client.createDashboardFromPrompt(input.prompt, {
              title: input.title,
              folder: input.folder,
              overwrite: input.overwrite,
              query_type: input.query_type,
              validate_queries: input.validate_queries,
            }),
          );
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
