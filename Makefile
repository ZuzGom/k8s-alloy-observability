APPS_NAMESPACE=apps
OLLY_NAMESPACE=olly
DEPLOYMENT_FILE=./kubernetes/deployments.yml
SERVICE_FILE=./kubernetes/services.yml
K6_JOB=./kubernetes/k6-job.yml
CONFIG_MAP=./kubernetes/config-map.yml

.PHONY: deploy delete status

# Deploy all
deploy:
	kubectl get namespace $(APPS_NAMESPACE) >/dev/null 2>&1 || kubectl create namespace $(APPS_NAMESPACE)
	kubectl get namespace $(OLLY_NAMESPACE) >/dev/null 2>&1 || kubectl create namespace $(OLLY_NAMESPACE)
	kubectl apply -f $(DEPLOYMENT_FILE) -n $(APPS_NAMESPACE)
	kubectl apply -f $(SERVICE_FILE) -n $(APPS_NAMESPACE)
	kubectl apply -f $(K6_JOB)
	kubectl apply -f $(CONFIG_MAP)

# Delete all
delete:
	kubectl delete -f $(K6_JOB) --ignore-not-found=true
	kubectl delete -f $(DEPLOYMENT_FILE) -n $(APPS_NAMESPACE) --ignore-not-found=true
	kubectl delete -f $(SERVICE_FILE) -n $(APPS_NAMESPACE) --ignore-not-found=true
	kubectl delete namespace $(APPS_NAMESPACE) --ignore-not-found=true
	kubectl delete namespace $(OLLY_NAMESPACE) --ignore-not-found=true

# Check status
status:
	kubectl get all -n $(APPS_NAMESPACE)
	kubectl get all -n $(OLLY_NAMESPACE)
