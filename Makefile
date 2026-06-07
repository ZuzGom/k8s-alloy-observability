APPS_NAMESPACE=apps
OLLY_NAMESPACE=olly
DEPLOYMENT_FILE=./kubernetes/deployments.yml
SERVICE_FILE=./kubernetes/services.yml
K6_JOB=./kubernetes/k6-job.yml
CONFIG_MAP=./kubernetes/k6-config.yml
ALLOY_CONFIG=./kubernetes/alloy-config.yml
GRAFANA_VALUES=./kubernetes/grafana-values.yml
LOKI_VALUES=./kubernetes/loki-values.yml
GRAFANA_RELEASE=grafana
LOKI_RELEASE=loki
ALLOY_RELEASE=alloy
PROMETHEUS_RELEASE=prometheus
GRAFANA_CHART=grafana/grafana
LOKI_CHART=grafana/loki-stack
ALLOY_CHART=grafana/alloy
PROMETHEUS_CHART=prometheus-community/prometheus

.PHONY: help deploy namespaces deploy-app install-loki install-grafana install-alloy install-prometheus restart-k6 port-forward-grafana port-forward-prometheus open-grafana grafana-password verify-loki install-mcp-grafana setup-mcp-grafana setup-cursor enable-mcp-grafana verify-mcp-grafana agent-grafana agent-mcp update-alloy fix-dashboard-data delete status add-alloy

# User prompt for agent-grafana / agent-mcp (required)
PROMPT ?=

# Show common commands (see SETUP.md for details)
help:
	@echo Quick start:
	@echo   make deploy
	@echo   make port-forward-grafana    # separate terminal, keep open
	@echo   make enable-mcp-grafana
	@echo   restart Cursor IDE
	@echo   make verify-mcp-grafana
	@echo.
	@echo Daily:
	@echo   make status / make restart-k6 / make verify-loki
	@echo   make fix-dashboard-data / make delete
	@echo.
	@echo Grafana: admin / make grafana-password
	@echo Docs: SETUP.md, DEMO.md, mcp-grafana/README.md

# Deploy all (cluster + Grafana MCP config and npm dependencies)
deploy: deploy-app install-loki install-prometheus install-grafana install-alloy restart-k6 setup-mcp-grafana
	@echo.
	@echo Deploy complete. Next steps:
	@echo   1. make port-forward-grafana   (separate terminal)
	@echo   2. make enable-mcp-grafana
	@echo   3. Restart Cursor IDE
	@echo   4. make verify-mcp-grafana

# Create namespaces used by the app and observability stack
namespaces:
	kubectl create namespace $(APPS_NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -
	kubectl create namespace $(OLLY_NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -

# Deploy sample application and k6 configuration
deploy-app: namespaces
	kubectl apply -f $(CONFIG_MAP)
	kubectl apply -f $(DEPLOYMENT_FILE) -n $(APPS_NAMESPACE)
	kubectl apply -f $(SERVICE_FILE) -n $(APPS_NAMESPACE)

# Install Loki without its bundled log agents or Grafana
install-loki: namespaces
	helm repo add grafana https://grafana.github.io/helm-charts --force-update
	helm repo update
	helm upgrade --install $(LOKI_RELEASE) $(LOKI_CHART) -n $(OLLY_NAMESPACE) --create-namespace -f $(LOKI_VALUES) \
		--set loki.image.tag=2.9.8 \
		--set promtail.enabled=false \
		--set fluent-bit.enabled=false \
		--set grafana.enabled=false

# Install Grafana
install-grafana: namespaces
	helm repo add grafana https://grafana.github.io/helm-charts --force-update
	helm repo update
	helm upgrade --install $(GRAFANA_RELEASE) $(GRAFANA_CHART) -n $(OLLY_NAMESPACE) --create-namespace -f $(GRAFANA_VALUES)

# Install Prometheus for Kubernetes and application metrics
install-prometheus: namespaces
	helm repo add prometheus-community https://prometheus-community.github.io/helm-charts --force-update
	helm repo update
	helm upgrade --install $(PROMETHEUS_RELEASE) $(PROMETHEUS_CHART) -n $(OLLY_NAMESPACE) --create-namespace

# Install Alloy using the repository-managed ConfigMap
install-alloy: namespaces
	kubectl apply -f $(ALLOY_CONFIG)
	helm repo add grafana https://grafana.github.io/helm-charts --force-update
	helm repo update
	helm upgrade --install $(ALLOY_RELEASE) $(ALLOY_CHART) -n $(OLLY_NAMESPACE) --create-namespace \
		--set alloy.configMap.create=false \
		--set alloy.configMap.name=alloy-config \
		--set alloy.configMap.key=config.alloy \
		--set controller.type=deployment

# Re-run k6 to generate fresh traffic and logs
restart-k6: namespaces
	kubectl delete -f $(K6_JOB) --ignore-not-found=true
	kubectl apply -f $(K6_JOB)

# Open Grafana locally at http://localhost:3000
port-forward-grafana:
	kubectl port-forward -n $(OLLY_NAMESPACE) svc/$(GRAFANA_RELEASE) 3000:80

# Open Grafana through minikube (NodePort 30300). Keeps a tunnel open on Docker/Windows.
open-grafana:
	@echo "Starting Grafana tunnel. On Minikube/Docker (Windows), keep this terminal open."
	@echo "Login: admin / run 'make grafana-password' in another terminal."
	@echo "Dashboard: Observability -> Bookinfo Logs (Loki)"
	minikube service $(GRAFANA_RELEASE) -n $(OLLY_NAMESPACE) --url

# Print Grafana admin password
grafana-password:
	@powershell -NoProfile -Command "[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String((kubectl get secret $(GRAFANA_RELEASE) -n $(OLLY_NAMESPACE) -o jsonpath='{.data.admin-password}')))"

# Verify Loki has log streams from Alloy
verify-loki:
	kubectl exec -n $(OLLY_NAMESPACE) deploy/$(GRAFANA_RELEASE) -- wget -qO- "http://loki.olly:3100/loki/api/v1/label/job/values"

# Install dependencies for the Grafana MCP server used by Cursor
install-mcp-grafana:
	cd mcp-grafana && npm install

# Register grafana-query in ~/.cursor/mcp.json for Cursor CLI (agent) and IDE
setup-mcp-grafana: install-mcp-grafana
	powershell -NoProfile -ExecutionPolicy Bypass -File ./mcp-grafana/scripts/setup-global-mcp.ps1 -RepoRoot "$(CURDIR)"

# MCP npm install + Cursor config + CLI approval
setup-cursor: setup-mcp-grafana enable-mcp-grafana

# Approve grafana-query MCP server in Cursor CLI
enable-mcp-grafana:
	agent mcp enable grafana-query
	agent mcp list

# Run Cursor agent with Grafana MCP tools and a user prompt
# Example: make agent-grafana PROMPT="List Loki jobs and create a logs count dashboard"
agent-grafana:
ifeq ($(strip $(PROMPT)),)
	$(error PROMPT is required. Example: make agent-grafana PROMPT="List Loki jobs and create a logs count dashboard")
endif
	agent -p --trust --force --approve-mcps "$(PROMPT)"

agent-mcp: agent-grafana

# Apply Alloy label rules and restart log collection
update-alloy:
	kubectl apply -f $(ALLOY_CONFIG)
	kubectl rollout restart deployment/$(ALLOY_RELEASE) -n $(OLLY_NAMESPACE)
	kubectl rollout status deployment/$(ALLOY_RELEASE) -n $(OLLY_NAMESPACE) --timeout=180s

# Refresh Alloy labels, k6 traffic, and reprovision Grafana dashboards
fix-dashboard-data: update-alloy restart-k6 install-grafana

# Verify Grafana port-forward and MCP connectivity
verify-mcp-grafana:
	@powershell -NoProfile -Command "try { $$r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 3; Write-Host 'Grafana: OK (' $$r.StatusCode ')'; exit 0 } catch { Write-Host 'Grafana: unreachable — run make port-forward-grafana in another terminal'; exit 1 }"
	@powershell -NoProfile -Command "$$pw = [System.Environment]::GetEnvironmentVariable('GRAFANA_PASSWORD','User'); $$cred = Join-Path $$env:USERPROFILE '.cursor\grafana-query.env'; if ($$pw) { Write-Host 'GRAFANA_PASSWORD: set (user env)' } elseif (Test-Path $$cred) { Write-Host 'GRAFANA_PASSWORD: set (~/.cursor/grafana-query.env)' } else { Write-Host 'GRAFANA_PASSWORD: missing — run make setup-mcp-grafana'; exit 1 }"
	@powershell -NoProfile -Command "if (Get-Command agent -ErrorAction SilentlyContinue) { agent mcp list } else { Write-Host 'Cursor CLI (agent) not installed — skip MCP list; check Settings -^> MCP in Cursor IDE' }"

# Open Prometheus locally at http://localhost:9090
port-forward-prometheus:
	kubectl port-forward -n $(OLLY_NAMESPACE) svc/$(PROMETHEUS_RELEASE)-server 9090:80

# Delete all
delete:
	helm uninstall $(ALLOY_RELEASE) -n $(OLLY_NAMESPACE) --ignore-not-found
	helm uninstall $(GRAFANA_RELEASE) -n $(OLLY_NAMESPACE) --ignore-not-found
	helm uninstall $(LOKI_RELEASE) -n $(OLLY_NAMESPACE) --ignore-not-found
	helm uninstall $(PROMETHEUS_RELEASE) -n $(OLLY_NAMESPACE) --ignore-not-found
	kubectl delete -f $(K6_JOB) --ignore-not-found=true
	kubectl delete -f $(CONFIG_MAP) --ignore-not-found=true
	kubectl delete -f $(ALLOY_CONFIG) --ignore-not-found=true
	kubectl delete -f $(DEPLOYMENT_FILE) -n $(APPS_NAMESPACE) --ignore-not-found=true
	kubectl delete -f $(SERVICE_FILE) -n $(APPS_NAMESPACE) --ignore-not-found=true
	kubectl delete namespace $(APPS_NAMESPACE) --ignore-not-found=true
	kubectl delete namespace $(OLLY_NAMESPACE) --ignore-not-found=true

# Check status
status:
	kubectl get all -n $(APPS_NAMESPACE)
	kubectl get all -n $(OLLY_NAMESPACE)
	helm list -n $(OLLY_NAMESPACE)

add-alloy: install-alloy
