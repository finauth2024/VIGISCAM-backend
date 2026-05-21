# Azure Infrastructure (Bicep)

Infrastructure-as-code for the VIGISCAM backend. One environment per resource
group: **dev**, **staging**, **prod**. See
[`docs/01-INFRASTRUCTURE-AND-ARCHITECTURE.md`](../../docs/01-INFRASTRUCTURE-AND-ARCHITECTURE.md).

> **Status:** templates written, **not yet deployed**. Deploying requires the
> Azure CLI and an authenticated Azure subscription — neither was available in
> the environment where these files were generated.

## What `main.bicep` provisions

Log Analytics + Application Insights · Key Vault · PostgreSQL Flexible Server
(+ `vigiscam` database) · Redis · Storage account (+ `evidence` blob container) ·
Container Registry · Container Apps environment + the backend Container App ·
a user-assigned managed identity wired to Key Vault (Secrets User) and ACR (Pull).

## Prerequisites

- Azure CLI: `az` (with the Bicep tooling — `az bicep install`).
- An Azure subscription and `Contributor` + `User Access Administrator` (the
  template creates role assignments), plus `Key Vault Secrets Officer` so the
  deployment can write secrets into the RBAC-enabled Key Vault.

## Deploy

```bash
# 1. Log in and select the subscription
az login
az account set --subscription "<SUBSCRIPTION_ID>"

# 2. Create the resource group (once per environment)
az group create --name rg-vigiscam-dev --location eastus

# 3. Validate before deploying
az deployment group what-if \
  --resource-group rg-vigiscam-dev \
  --template-file main.bicep \
  --parameters main.parameters.dev.json \
  --parameters postgresAdminPassword="<STRONG_PASSWORD>"

# 4. Deploy
az deployment group create \
  --resource-group rg-vigiscam-dev \
  --template-file main.bicep \
  --parameters main.parameters.dev.json \
  --parameters postgresAdminPassword="<STRONG_PASSWORD>"
```

Repeat with `environmentName=staging` / `prod` and matching resource groups.
Store `postgresAdminPassword` in a secure place (it is a `@secure()` parameter
and is never written to the parameters file).

## Wire up CI/CD (GitHub Actions → Azure)

`.github/workflows/deploy.yml` deploys via **OIDC** (no stored cloud passwords).
After provisioning, configure the GitHub repository:

**Secrets** (federated credential — create an Entra app registration / federated
credential for the repo):
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

**Variables** (from the Bicep outputs):
- `ACR_NAME` — `acrName` output
- `RESOURCE_GROUP` — e.g. `rg-vigiscam-dev`
- `CONTAINER_APP_NAME` — `containerAppName` output

Then run the **Deploy** workflow (`workflow_dispatch`). Once stable, add a
`push: branches: [main]` trigger to `deploy.yml` for continuous deployment.

## DNS

Point the NameCheap domain at:
- `api.vigiscam.<tld>` → the backend (`backendUrl` output / Azure Front Door).
- apex / `www` → Vercel (the website).

## Phase-1 hardening TODO

- Move PostgreSQL / Redis / Storage / Key Vault onto a VNet with **private
  endpoints**; remove public network access.
- Add **Azure Front Door + WAF** in front of the Container App.
- Split `main.bicep` into modules as the resource count grows.
