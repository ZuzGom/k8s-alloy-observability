param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
)

$ErrorActionPreference = "Stop"

$repoRootResolved = (Resolve-Path $RepoRoot).Path
$wrapperScript = Join-Path $repoRootResolved "mcp-grafana\scripts\run-mcp.mjs"
$projectMcpPath = Join-Path $repoRootResolved ".cursor\mcp.json"

if (-not (Test-Path $wrapperScript)) {
    throw "MCP wrapper script not found: $wrapperScript"
}

$cursorDir = Join-Path $env:USERPROFILE ".cursor"
$globalMcpPath = Join-Path $cursorDir "mcp.json"
$credentialsPath = Join-Path $cursorDir "grafana-query.env"
New-Item -ItemType Directory -Force -Path $cursorDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $projectMcpPath) | Out-Null

$password = $null
$secret = kubectl get secret grafana -n olly -o jsonpath='{.data.admin-password}' 2>$null
if ($LASTEXITCODE -eq 0 -and $secret) {
    $password = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($secret))
    [System.Environment]::SetEnvironmentVariable("GRAFANA_PASSWORD", $password, "User")
    Write-Host "Set GRAFANA_PASSWORD in user environment."
} else {
    $password = [System.Environment]::GetEnvironmentVariable("GRAFANA_PASSWORD", "User")
    if (-not $password) {
        Write-Warning "Could not read Grafana password from cluster. Set GRAFANA_PASSWORD manually or run: make grafana-password"
    }
}

if (-not $password) {
    throw "GRAFANA_PASSWORD is required to configure MCP. Deploy Grafana first or set the variable manually."
}

"GRAFANA_PASSWORD=$password" | Set-Content -Path $credentialsPath -Encoding UTF8 -NoNewline
Write-Host "Wrote credentials to $credentialsPath"

$nodeExe = (Get-Command node -ErrorAction Stop).Source
try {
    $nodeExe = (New-Object -ComObject Scripting.FileSystemObject).GetFile($nodeExe).ShortPath
} catch {
    # Keep long path if short path lookup fails.
}
$nodeExe = $nodeExe -replace "\\", "/"
$wrapperForJson = $wrapperScript -replace "\\", "/"

function New-McpConfig {
    return [ordered]@{
        mcpServers = [ordered]@{
            "grafana-query" = [ordered]@{
                command = $nodeExe
                args    = @($wrapperForJson)
            }
        }
    }
}

function Merge-McpConfig {
    param(
        [string]$Path
    )

    $config = New-McpConfig
    if (-not (Test-Path $Path)) {
        return $config
    }

    try {
        $existing = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($existing.mcpServers) {
            foreach ($prop in $existing.mcpServers.PSObject.Properties) {
                if ($prop.Name -ne "grafana-query") {
                    $config.mcpServers[$prop.Name] = $prop.Value
                }
            }
        }
    } catch {
        Write-Warning "Could not parse existing $Path; other servers were skipped."
    }

    return $config
}

foreach ($path in @($globalMcpPath, $projectMcpPath)) {
    $config = Merge-McpConfig -Path $path
    ($config | ConvertTo-Json -Depth 10) + "`n" | Set-Content -Path $path -Encoding UTF8 -NoNewline:$false
    Write-Host "Wrote grafana-query MCP server to $path"
}

Write-Host "Node: $nodeExe"
Write-Host "Wrapper: $wrapperForJson"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. make port-forward-grafana   (required - MCP talks to http://127.0.0.1:3000)"
Write-Host "  2. agent mcp enable grafana-query"
Write-Host "  3. make verify-mcp-grafana"
