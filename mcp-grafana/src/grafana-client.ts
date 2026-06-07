import {
  buildDashboardFromPanels,
  buildDashboardUid,
  inferPanelType,
  panelTitleFromSuggestion,
  titleFromPrompt,
  type DashboardPanelInput,
} from "./dashboard-builder.js";

export interface GrafanaConfig {
  url: string;
  user: string;
  password: string;
}

export interface Datasource {
  id: number;
  uid: string;
  name: string;
  type: string;
  isDefault: boolean;
}

export interface DashboardSearchResult {
  id: number;
  uid: string;
  title: string;
  folderTitle?: string;
  tags?: string[];
}

export interface DashboardCreateResult {
  id: number;
  uid: string;
  url: string;
  slug: string;
  status: string;
  version: number;
  folderUid?: string;
}

export interface DashboardFromPromptResult {
  prompt: string;
  title: string;
  dashboard: DashboardCreateResult;
  panels: DashboardPanelInput[];
  suggestions: QuerySuggestion[];
  discovered: Record<string, unknown>;
}

export interface QuerySuggestion {
  queryType: "loki" | "prometheus";
  datasourceUid: string;
  datasourceName: string;
  query: string;
  rationale: string;
  exploreUrl?: string;
}

const PROJECT_CONTEXT = {
  namespaces: ["apps", "olly"],
  lokiJobs: [
    "loki.source.kubernetes.bookinfo",
    "loki.source.kubernetes.k6",
  ],
  bookinfoApps: ["productpage", "details", "ratings", "reviews"],
  exampleLogql: [
    '{job="loki.source.kubernetes.bookinfo"}',
    '{job="loki.source.kubernetes.k6"}',
    '{job="loki.source.kubernetes.bookinfo"} |~ "(?i)error|exception|fail"',
  ],
  examplePromql: [
    "up",
    "rate(container_cpu_usage_seconds_total[5m])",
    "kube_pod_status_phase",
  ],
};

export class GrafanaClient {
  private readonly authHeader: string;

  constructor(private readonly config: GrafanaConfig) {
    const token = Buffer.from(`${config.user}:${config.password}`).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  getProjectContext() {
    return {
      ...PROJECT_CONTEXT,
      grafanaUrl: this.config.url,
      notes: [
        "Bookinfo logs use Loki labels job, app, namespace, pod (app requires Alloy relabel rules).",
        "k6 logs use job loki.source.kubernetes.k6 and app=k6.",
        "k6 runs ~30s — use Grafana time range Last 15 minutes right after make restart-k6.",
        "Default Loki datasource uid is usually 'loki'. Default Prometheus uid is usually 'prometheus'.",
      ],
    };
  }

  async health(): Promise<{ ok: boolean; version?: string; message: string }> {
    try {
      const response = await this.request<{ version?: string }>("/api/health");
      return {
        ok: response.ok,
        version: response.data.version,
        message: response.ok ? "Connected to Grafana" : `Grafana health check failed (${response.status})`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Unknown Grafana connection error",
      };
    }
  }

  async listDatasources(): Promise<Datasource[]> {
    const response = await this.request<Datasource[]>("/api/datasources");
    if (!response.ok) {
      throw new Error(`Failed to list datasources: ${response.status} ${JSON.stringify(response.data)}`);
    }
    return response.data;
  }

  async getDatasourceByType(type: string): Promise<Datasource | undefined> {
    const datasources = await this.listDatasources();
    return datasources.find((ds) => ds.type === type) ?? datasources.find((ds) => ds.isDefault);
  }

  async lokiLabelNames(datasourceUid: string, start?: number, end?: number): Promise<string[]> {
    const params = new URLSearchParams();
    if (start) params.set("start", String(start));
    if (end) params.set("end", String(end));

    const response = await this.request<{ data?: string[] }>(
      `/api/datasources/proxy/uid/${datasourceUid}/loki/api/v1/labels?${params.toString()}`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch Loki labels: ${response.status}`);
    }
    return this.unwrapLokiData(response.data);
  }

  async lokiLabelValues(
    datasourceUid: string,
    label: string,
    start?: number,
    end?: number,
  ): Promise<string[]> {
    const params = new URLSearchParams();
    if (start) params.set("start", String(start));
    if (end) params.set("end", String(end));

    const response = await this.request<{ data?: string[] }>(
      `/api/datasources/proxy/uid/${datasourceUid}/loki/api/v1/label/${encodeURIComponent(label)}/values?${params.toString()}`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch Loki label values for ${label}: ${response.status}`);
    }
    return this.unwrapLokiData(response.data);
  }

  async queryLoki(
    datasourceUid: string,
    expr: string,
    limit = 20,
    rangeMinutes = 60,
  ): Promise<unknown> {
    const end = Date.now();
    const start = end - rangeMinutes * 60 * 1000;

    const response = await this.request("/api/ds/query", {
      method: "POST",
      body: JSON.stringify({
        queries: [
          {
            refId: "A",
            datasource: { type: "loki", uid: datasourceUid },
            expr,
            queryType: "range",
            maxLines: limit,
          },
        ],
        from: String(start),
        to: String(end),
      }),
    });

    if (!response.ok) {
      throw new Error(`Loki query failed: ${response.status} ${JSON.stringify(response.data)}`);
    }

    return response.data;
  }

  async prometheusLabelNames(datasourceUid: string): Promise<string[]> {
    const response = await this.request<{ data?: string[] }>(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/labels`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch Prometheus labels: ${response.status}`);
    }
    return this.unwrapPrometheusData(response.data);
  }

  async prometheusLabelValues(datasourceUid: string, label: string): Promise<string[]> {
    const response = await this.request<{ data?: string[] }>(
      `/api/datasources/proxy/uid/${datasourceUid}/api/v1/label/${encodeURIComponent(label)}/values`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch Prometheus label values for ${label}: ${response.status}`);
    }
    return this.unwrapPrometheusData(response.data);
  }

  async prometheusMetricNames(datasourceUid: string): Promise<string[]> {
    return this.prometheusLabelValues(datasourceUid, "__name__");
  }

  async queryPrometheus(
    datasourceUid: string,
    expr: string,
    rangeMinutes = 60,
  ): Promise<unknown> {
    const end = Date.now();
    const start = end - rangeMinutes * 60 * 1000;

    const response = await this.request("/api/ds/query", {
      method: "POST",
      body: JSON.stringify({
        queries: [
          {
            refId: "A",
            datasource: { type: "prometheus", uid: datasourceUid },
            expr,
            range: true,
            format: "time_series",
          },
        ],
        from: String(start),
        to: String(end),
      }),
    });

    if (!response.ok) {
      throw new Error(`Prometheus query failed: ${response.status} ${JSON.stringify(response.data)}`);
    }

    return response.data;
  }

  async searchDashboards(query = ""): Promise<DashboardSearchResult[]> {
    const params = new URLSearchParams({ type: "dash-db" });
    if (query) params.set("query", query);

    const response = await this.request<DashboardSearchResult[]>(`/api/search?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to search dashboards: ${response.status}`);
    }
    return response.data;
  }

  async getDashboard(uid: string): Promise<unknown> {
    const response = await this.request(`/api/dashboards/uid/${uid}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch dashboard ${uid}: ${response.status}`);
    }
    return response.data;
  }

  extractQueriesFromDashboard(dashboardPayload: unknown): Array<{
    title: string;
    queryType: string;
    expr: string;
    datasourceUid?: string;
  }> {
    const queries: Array<{
      title: string;
      queryType: string;
      expr: string;
      datasourceUid?: string;
    }> = [];

    const payload = dashboardPayload as {
      dashboard?: { panels?: Array<Record<string, unknown>>; title?: string };
    };

    const panels = payload.dashboard?.panels ?? [];
    for (const panel of panels) {
      const title = String(panel.title ?? "Untitled panel");
      const targets = (panel.targets as Array<Record<string, unknown>> | undefined) ?? [];
      for (const target of targets) {
        const expr = String(target.expr ?? target.query ?? "");
        if (!expr) continue;
        queries.push({
          title,
          queryType: String(target.queryType ?? panel.type ?? "unknown"),
          expr,
          datasourceUid: (target.datasource as { uid?: string } | undefined)?.uid,
        });
      }
    }

    return queries;
  }

  async listFolders(): Promise<Array<{ id: number; uid: string; title: string }>> {
    const response = await this.request<Array<{ id: number; uid: string; title: string }>>("/api/folders");
    if (!response.ok) {
      throw new Error(`Failed to list folders: ${response.status}`);
    }
    return response.data;
  }

  async resolveFolderUid(folderTitle?: string): Promise<string | undefined> {
    if (!folderTitle) return undefined;
    const folders = await this.listFolders();
    const match = folders.find((folder) => folder.title.toLowerCase() === folderTitle.toLowerCase());
    return match?.uid;
  }

  dashboardUrl(uid: string): string {
    return `${this.config.url.replace(/\/$/, "")}/d/${uid}`;
  }

  async createDashboard(payload: {
    dashboard: Record<string, unknown>;
    folderUid?: string;
    overwrite?: boolean;
    message?: string;
  }): Promise<DashboardCreateResult> {
    const response = await this.request<{
      id: number;
      uid: string;
      url: string;
      slug: string;
      status: string;
      version: number;
      folderUid?: string;
    }>("/api/dashboards/db", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to create dashboard: ${response.status} ${JSON.stringify(response.data)}`);
    }

    return {
      ...response.data,
      url: `${this.config.url.replace(/\/$/, "")}${response.data.url}`,
    };
  }

  async createDashboardFromPanels(input: {
    title: string;
    panels: DashboardPanelInput[];
    folder?: string;
    overwrite?: boolean;
    uid?: string;
    tags?: string[];
  }): Promise<DashboardFromPromptResult> {
    const folderUid = await this.resolveFolderUid(input.folder);
    const payload = buildDashboardFromPanels(
      {
        title: input.title,
        uid: input.uid ?? buildDashboardUid(input.title, input.overwrite),
        tags: input.tags,
      },
      input.panels,
    );

    const created = await this.createDashboard({
      dashboard: payload.dashboard,
      folderUid,
      overwrite: input.overwrite ?? false,
      message: `Created by grafana-query-mcp: ${input.title}`,
    });

    return {
      prompt: input.title,
      title: input.title,
      dashboard: created,
      panels: input.panels,
      suggestions: input.panels.map((panel) => ({
        queryType: panel.queryType,
        datasourceUid: panel.datasourceUid,
        datasourceName: panel.queryType === "loki" ? "Loki" : "Prometheus",
        query: panel.expr,
        rationale: panel.title,
      })),
      discovered: {},
    };
  }

  async createDashboardFromPrompt(
    prompt: string,
    options: {
      title?: string;
      folder?: string;
      overwrite?: boolean;
      query_type?: "auto" | "loki" | "prometheus";
      validate_queries?: boolean;
    } = {},
  ): Promise<DashboardFromPromptResult> {
    const suggestionResult = await this.suggestQueries(prompt, options.query_type ?? "auto");
    if (suggestionResult.suggestions.length === 0) {
      throw new Error("No queries could be generated from the prompt");
    }

    const panels: DashboardPanelInput[] = [];
    for (const suggestion of suggestionResult.suggestions) {
      if (options.validate_queries ?? true) {
        if (suggestion.queryType === "loki") {
          await this.queryLoki(suggestion.datasourceUid, suggestion.query, 1, 60);
        } else {
          await this.queryPrometheus(suggestion.datasourceUid, suggestion.query, 60);
        }
      }

      panels.push({
        title: panelTitleFromSuggestion(suggestion, prompt),
        queryType: suggestion.queryType,
        panelType: inferPanelType({
          title: suggestion.rationale,
          queryType: suggestion.queryType,
          expr: suggestion.query,
          datasourceUid: suggestion.datasourceUid,
        }),
        expr: suggestion.query,
        datasourceUid: suggestion.datasourceUid,
      });
    }

    const title = options.title ?? titleFromPrompt(prompt);
    const folderUid = await this.resolveFolderUid(options.folder);
    const dashboardPayload = buildDashboardFromPanels(
      {
        title,
        uid: buildDashboardUid(title, options.overwrite),
        tags: ["generated", "mcp", "bookinfo"],
      },
      panels,
    );

    const created = await this.createDashboard({
      dashboard: dashboardPayload.dashboard,
      folderUid,
      overwrite: options.overwrite ?? false,
      message: `Created by grafana-query-mcp from prompt: ${prompt}`,
    });

    return {
      prompt,
      title,
      dashboard: created,
      panels,
      suggestions: suggestionResult.suggestions,
      discovered: suggestionResult.discovered,
    };
  }

  async suggestQueries(prompt: string, preferredType: "auto" | "loki" | "prometheus" = "auto"): Promise<{
    prompt: string;
    suggestions: QuerySuggestion[];
    discovered: Record<string, unknown>;
  }> {
    const lower = prompt.toLowerCase();
    const wantsPrometheus =
      preferredType === "prometheus" ||
      (preferredType === "auto" &&
        /\b(metric|promql|cpu|memory|rate|latency|up\b|pod status|request)/.test(lower));
    const wantsLoki =
      preferredType === "loki" ||
      (preferredType === "auto" &&
        /\b(log|loki|logql|error|exception|trace|bookinfo|k6|productpage|details|ratings|reviews)/.test(lower));

    const suggestions: QuerySuggestion[] = [];
    const discovered: Record<string, unknown> = {};

    if (wantsLoki || preferredType === "auto") {
      const loki = await this.getDatasourceByType("loki");
      if (loki) {
        const labels = await this.lokiLabelNames(loki.uid).catch((): string[] => []);
        discovered.lokiLabels = labels;

        let jobValues: string[] = [];
        if (labels.includes("job")) {
          jobValues = await this.lokiLabelValues(loki.uid, "job").catch((): string[] => []);
          discovered.lokiJobValues = jobValues;
        }

        const bookinfoJob =
          jobValues.find((job) => job.includes("bookinfo")) ?? PROJECT_CONTEXT.lokiJobs[0];
        const k6Job = jobValues.find((job) => job.includes("k6")) ?? PROJECT_CONTEXT.lokiJobs[1];
        const groupLabel = labels.includes("app") ? "app" : "instance";
        const wantsVolume = /volume|count|over time|logs per|log count|dashboard/.test(lower);
        const wantsRawLogs = /raw log|log lines|show logs|logs panel/.test(lower);

        if (wantsVolume) {
          suggestions.push({
            queryType: "loki",
            datasourceUid: loki.uid,
            datasourceName: loki.name,
            query: `sum(count_over_time({job=~"loki.source.kubernetes.+"}[1m]))`,
            rationale: "Total log volume per minute.",
          });
          suggestions.push({
            queryType: "loki",
            datasourceUid: loki.uid,
            datasourceName: loki.name,
            query: `sum by (job) (count_over_time({job=~"loki.source.kubernetes.+"}[1m]))`,
            rationale: "Log count by Loki job.",
          });
          suggestions.push({
            queryType: "loki",
            datasourceUid: loki.uid,
            datasourceName: loki.name,
            query: `sum by (${groupLabel}) (count_over_time({job="${bookinfoJob}"}[1m]))`,
            rationale: `Bookinfo log volume by ${groupLabel}.`,
          });
        }

        if (/\bk6\b|load generator|traffic/.test(lower) && (!wantsVolume || wantsRawLogs)) {
          suggestions.push({
            queryType: "loki",
            datasourceUid: loki.uid,
            datasourceName: loki.name,
            query: `{job="${k6Job}"}`,
            rationale: "Matches k6 load generator logs.",
          });
        }

        if (/bookinfo|productpage|details|ratings|reviews|application log/.test(lower) && (!wantsVolume || wantsRawLogs)) {
          let query = `{job="${bookinfoJob}"}`;
          if (/error|fail|exception|warn/.test(lower)) {
            query += ' |~ "(?i)error|exception|fail|warn"';
          }
          suggestions.push({
            queryType: "loki",
            datasourceUid: loki.uid,
            datasourceName: loki.name,
            query,
            rationale: "Matches Bookinfo application logs collected by Alloy.",
          });
        }

        if (suggestions.length === 0) {
          suggestions.push({
            queryType: "loki",
            datasourceUid: loki.uid,
            datasourceName: loki.name,
            query: `{job="${bookinfoJob}"}`,
            rationale: "Default Bookinfo log stream for this project.",
          });
        }
      }
    }

    if (wantsPrometheus) {
      const prometheus = await this.getDatasourceByType("prometheus");
      if (prometheus) {
        const metrics = await this.prometheusMetricNames(prometheus.uid).catch((): string[] => []);
        discovered.prometheusMetricsSample = metrics.slice(0, 50);

        if (/up\b|availability|healthy/.test(lower)) {
          suggestions.push({
            queryType: "prometheus",
            datasourceUid: prometheus.uid,
            datasourceName: prometheus.name,
            query: "up",
            rationale: "Shows scrape target health.",
          });
        } else if (/cpu/.test(lower)) {
          suggestions.push({
            queryType: "prometheus",
            datasourceUid: prometheus.uid,
            datasourceName: prometheus.name,
            query: 'rate(container_cpu_usage_seconds_total{namespace="apps"}[5m])',
            rationale: "CPU usage rate for workloads in apps namespace.",
          });
        } else if (/memory|mem/.test(lower)) {
          suggestions.push({
            queryType: "prometheus",
            datasourceUid: prometheus.uid,
            datasourceName: prometheus.name,
            query: 'container_memory_working_set_bytes{namespace="apps"}',
            rationale: "Working set memory for apps namespace containers.",
          });
        } else if (/pod/.test(lower)) {
          suggestions.push({
            queryType: "prometheus",
            datasourceUid: prometheus.uid,
            datasourceName: prometheus.name,
            query: 'kube_pod_status_phase{namespace="apps"}',
            rationale: "Pod phase metrics from kube-state-metrics.",
          });
        } else {
          suggestions.push({
            queryType: "prometheus",
            datasourceUid: prometheus.uid,
            datasourceName: prometheus.name,
            query: "up",
            rationale: "Safe default Prometheus query to verify metrics availability.",
          });
        }
      }
    }

    return { prompt, suggestions, discovered };
  }

  private unwrapLokiData(payload: { data?: string[] } | string[]): string[] {
    if (Array.isArray(payload)) return payload;
    return payload.data ?? [];
  }

  private unwrapPrometheusData(payload: { data?: string[] } | string[]): string[] {
    if (Array.isArray(payload)) return payload;
    return payload.data ?? [];
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ ok: boolean; status: number; data: T }> {
    const url = `${this.config.url.replace(/\/$/, "")}${path}`;
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.authHeader);
    headers.set("Accept", "application/json");
    if (init.body) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, { ...init, headers });
    const text = await response.text();
    let data: T;
    try {
      data = text ? (JSON.parse(text) as T) : ({} as T);
    } catch {
      data = text as T;
    }

    return { ok: response.ok, status: response.status, data };
  }
}

export function loadConfig(): GrafanaConfig {
  const url = process.env.GRAFANA_URL ?? "http://127.0.0.1:3000";
  const user = process.env.GRAFANA_USER ?? "admin";
  const password = process.env.GRAFANA_PASSWORD;

  if (!password) {
    throw new Error(
      "GRAFANA_PASSWORD is required. Set it in your environment or .cursor/mcp.json env block.",
    );
  }

  return { url, user, password };
}
