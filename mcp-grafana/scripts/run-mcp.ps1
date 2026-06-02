param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
)

$ErrorActionPreference = "Stop"

$password = [System.Environment]::GetEnvironmentVariable("GRAFANA_PASSWORD", "User")
if (-not $password) {
    Write-Error @"
GRAFANA_PASSWORD is not set.
Run from the project directory: make setup-mcp-grafana
"@
    exit 1
}

$entryScript = Join-Path $RepoRoot "mcp-grafana\src\index.ts"
if (-not (Test-Path $entryScript)) {
    Write-Error "MCP entry script not found: $entryScript"
    exit 1
}

$env:GRAFANA_URL = "http://127.0.0.1:3000"
$env:GRAFANA_USER = "admin"
$env:GRAFANA_PASSWORD = $password

Push-Location (Join-Path $RepoRoot "mcp-grafana")
try {
    & npx -y tsx $entryScript
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
