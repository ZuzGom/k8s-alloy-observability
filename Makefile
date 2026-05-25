APPS_NAMESPACE=apps
OLLY_NAMESPACE=olly
DEPLOYMENT_FILE=./kubernetes/deployments.yml
SERVICE_FILE=./kubernetes/services.yml
K6_JOB=./kubernetes/k6-job.yml
CONFIG_MAP=./kubernetes/k6-config.yml
ALLOY_CONFIG=./kubernetes/alloy-config.yml
GRAFANA_VALUES=./kubernetes/grafana-values.yml
GRAFANA_RELEASE=grafana
LOKI_RELEASE=loki
ALLOY_RELEASE=alloy
GRAFANA_CHART=grafana/grafana
LOKI_CHART=grafana/loki-stack
ALLOY_CHART=grafana/alloy

.PHONY: deploy namespaces deploy-app install-loki install-grafana install-alloy restart-k6 port-forward-grafana delete status add-alloy

# Deploy all
deploy: deploy-app install-loki install-grafana install-alloy restart-k6

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
	helm upgrade --install $(LOKI_RELEASE) $(LOKI_CHART) -n $(OLLY_NAMESPACE) --create-namespace \
		--set loki.image.tag=2.9.8 \
		--set promtail.enabled=false \
		--set fluent-bit.enabled=false \
		--set grafana.enabled=false

# Install Grafana
install-grafana: namespaces
	helm repo add grafana https://grafana.github.io/helm-charts --force-update
	helm repo update
	helm upgrade --install $(GRAFANA_RELEASE) $(GRAFANA_CHART) -n $(OLLY_NAMESPACE) --create-namespace -f $(GRAFANA_VALUES)

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

# Delete all
delete:
	helm uninstall $(ALLOY_RELEASE) -n $(OLLY_NAMESPACE) --ignore-not-found
	helm uninstall $(GRAFANA_RELEASE) -n $(OLLY_NAMESPACE) --ignore-not-found
	helm uninstall $(LOKI_RELEASE) -n $(OLLY_NAMESPACE) --ignore-not-found
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
