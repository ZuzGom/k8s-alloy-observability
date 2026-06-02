import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mcpRoot = join(scriptDir, "..");
const entry = join(mcpRoot, "src", "index.ts");
const tsxCli = join(mcpRoot, "node_modules", "tsx", "dist", "cli.mjs");
const credentialsFile = join(homedir(), ".cursor", "grafana-query.env");

function readCredentialsFile() {
  if (!existsSync(credentialsFile)) {
    return "";
  }

  const content = readFileSync(credentialsFile, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^GRAFANA_PASSWORD=(.*)$/);
    if (match) {
      return match[1].trim();
    }
  }

  return "";
}

const password = process.env.GRAFANA_PASSWORD || readCredentialsFile();
if (!password) {
  console.error(
    "GRAFANA_PASSWORD is not set. Run: make setup-mcp-grafana",
  );
  process.exit(1);
}

if (!existsSync(tsxCli)) {
  console.error(`Missing tsx. Run: make install-mcp-grafana (${tsxCli})`);
  process.exit(1);
}

const child = spawn(process.execPath, [tsxCli, entry], {
  cwd: mcpRoot,
  env: {
    ...process.env,
    GRAFANA_URL: process.env.GRAFANA_URL ?? "http://127.0.0.1:3000",
    GRAFANA_USER: process.env.GRAFANA_USER ?? "admin",
    GRAFANA_PASSWORD: password,
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});
