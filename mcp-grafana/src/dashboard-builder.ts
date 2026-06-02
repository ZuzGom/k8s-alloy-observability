export interface GridPos {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface DashboardPanelInput {
  title: string;
  queryType: "loki" | "prometheus";
  panelType?: "logs" | "timeseries" | "stat";
  expr: string;
  datasourceUid: string;
  gridPos?: GridPos;
}

export interface DashboardBuildOptions {
  title: string;
  uid?: string;
  tags?: string[];
  refresh?: string;
  timeFrom?: string;
  timeTo?: string;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function buildDashboardUid(title: string, overwrite = false): string {
  const base = slugify(title) || "generated-dashboard";
  return overwrite ? base : `${base}-${Date.now().toString(36).slice(-6)}`;
}

export function buildLogsPanel(
  id: number,
  title: string,
  expr: string,
  datasourceUid: string,
  gridPos: GridPos,
) {
  return {
    id,
    type: "logs",
    title,
    datasource: { type: "loki", uid: datasourceUid },
    gridPos,
    targets: [
      {
        refId: "A",
        expr,
        queryType: "range",
        datasource: { type: "loki", uid: datasourceUid },
      },
    ],
  };
}

export function buildTimeseriesPanel(
  id: number,
  title: string,
  expr: string,
  datasourceUid: string,
  gridPos: GridPos,
  datasourceType: "loki" | "prometheus" = "prometheus",
) {
  return {
    id,
    type: "timeseries",
    title,
    datasource: { type: datasourceType, uid: datasourceUid },
    gridPos,
    fieldConfig: {
      defaults: {
        custom: {
          drawStyle: "line",
          lineInterpolation: "linear",
          fillOpacity: 10,
        },
        unit: datasourceType === "loki" ? "logs/s" : undefined,
      },
      overrides: [],
    },
    targets: [
      {
        refId: "A",
        expr,
        queryType: datasourceType === "loki" ? "range" : undefined,
        range: datasourceType === "prometheus",
        datasource: { type: datasourceType, uid: datasourceUid },
      },
    ],
  };
}

export function buildStatPanel(
  id: number,
  title: string,
  expr: string,
  datasourceUid: string,
  gridPos: GridPos,
) {
  return {
    id,
    type: "stat",
    title,
    datasource: { type: "loki", uid: datasourceUid },
    gridPos,
    fieldConfig: {
      defaults: {
        unit: "short",
        decimals: 0,
        color: { mode: "thresholds" },
        thresholds: {
          mode: "absolute",
          steps: [{ color: "green", value: null }],
        },
      },
      overrides: [],
    },
    options: {
      reduceOptions: {
        calcs: ["lastNotNull"],
        fields: "",
        values: false,
      },
      orientation: "auto",
      textMode: "auto",
      colorMode: "value",
      graphMode: "area",
    },
    targets: [
      {
        refId: "A",
        expr,
        queryType: "instant",
        datasource: { type: "loki", uid: datasourceUid },
      },
    ],
  };
}

export function buildDashboardFromPanels(
  options: DashboardBuildOptions,
  panels: DashboardPanelInput[],
) {
  const builtPanels = panels.map((panel, index) => {
    const defaultHeight = panel.panelType === "stat" ? 4 : 12;
    const defaultWidth = panel.panelType === "stat" ? 8 : 24;
    const gridPos: GridPos = panel.gridPos ?? {
      h: defaultHeight,
      w: defaultWidth,
      x: 0,
      y: index * defaultHeight,
    };

    if (panel.panelType === "stat") {
      return buildStatPanel(index + 1, panel.title, panel.expr, panel.datasourceUid, gridPos);
    }
    if (panel.panelType === "timeseries" || panel.queryType === "prometheus") {
      return buildTimeseriesPanel(
        index + 1,
        panel.title,
        panel.expr,
        panel.datasourceUid,
        gridPos,
        panel.queryType,
      );
    }
    return buildLogsPanel(index + 1, panel.title, panel.expr, panel.datasourceUid, gridPos);
  });

  return {
    dashboard: {
      uid: options.uid ?? buildDashboardUid(options.title),
      title: options.title,
      tags: options.tags ?? ["generated", "mcp"],
      timezone: "browser",
      schemaVersion: 39,
      version: 0,
      refresh: options.refresh ?? "10s",
      time: {
        from: options.timeFrom ?? "now-1h",
        to: options.timeTo ?? "now",
      },
      panels: builtPanels,
    },
    overwrite: false,
  };
}

export function titleFromPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return "Generated Dashboard";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function panelTitleFromSuggestion(
  suggestion: { queryType: string; query: string; rationale: string },
  prompt: string,
): string {
  if (suggestion.queryType === "loki") {
    if (/error|fail|exception|warn/.test(suggestion.query)) return "Error logs";
    if (/k6/.test(suggestion.query)) return "k6 load generator logs";
    if (/bookinfo/.test(suggestion.query)) return "Bookinfo application logs";
    return "Application logs";
  }

  if (/^up$/.test(suggestion.query.trim())) return "Target health";
  if (/cpu/.test(suggestion.query)) return "CPU usage";
  if (/memory|mem/.test(suggestion.query)) return "Memory usage";
  if (/pod/.test(suggestion.query)) return "Pod status";
  return titleFromPrompt(prompt);
}
