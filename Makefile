NAMESPACE=apps
DEPLOYMENT_FILE=./kubernetes/deployments.yml
SERVICE_FILE=./kubernetes/services.yml
K6_JOB=./kubernetes/k6-job.yml
CONFIG_MAP=./kubernetes/config-map.yml

.PHONY: deploy delete status

# Deploy all
deploy:
	kubectl get namespace $(NAMESPACE) >/dev/null 2>&1 || kubectl create namespace $(NAMESPACE)
	kubectl apply -f $(DEPLOYMENT_FILE) -n $(NAMESPACE)
	kubectl apply -f $(SERVICE_FILE) -n $(NAMESPACE)
	kubectl apply -f $(K6_JOB)
	kubectl apply -f $(CONFIG_MAP)

# Delete all
delete:
	kubectl delete -f $(K6_JOB) --ignore-not-found=true
	kubectl delete -f $(DEPLOYMENT_FILE) -n $(NAMESPACE)
	kubectl delete -f $(SERVICE_FILE) -n $(NAMESPACE)
	kubectl delete namespace $(NAMESPACE) --ignore-not-found=true

# Check status
status:
	kubectl get all -n $(NAMESPACE)
