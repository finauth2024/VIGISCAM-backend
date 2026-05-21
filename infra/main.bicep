// ─────────────────────────────────────────────────────────────────────────────
// VIGISCAM Backend — Azure infrastructure (Phase 0)
//
// Provisions one environment (dev / staging / prod). Deploy once per environment
// into a dedicated resource group. See infra/README.md for the deploy commands.
//
// Resources: Log Analytics + App Insights, Key Vault, PostgreSQL Flexible Server,
// Redis, Storage (evidence blob), Container Registry, Container Apps environment
// + the backend Container App, wired together via a user-assigned managed identity.
//
// NOTE (Phase-1 hardening TODO): this template uses public endpoints with
// firewall rules. Production must move PostgreSQL / Redis / Storage / Key Vault
// onto a VNet with private endpoints (see docs/01-INFRASTRUCTURE-AND-ARCHITECTURE.md).
// ─────────────────────────────────────────────────────────────────────────────

targetScope = 'resourceGroup'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Environment name — drives naming and sizing.')
@allowed(['dev', 'staging', 'prod'])
param environmentName string = 'dev'

@description('Short, lowercase prefix for resource names (3-10 chars).')
@minLength(3)
@maxLength(10)
param namePrefix string = 'vigiscam'

@description('PostgreSQL administrator login. Must not share 3+ consecutive characters with the admin password (an Azure PostgreSQL rule).')
param postgresAdminLogin string = 'dbmaster'

@description('PostgreSQL administrator password.')
@secure()
param postgresAdminPassword string

@description('Container image for the backend. Defaults to a placeholder so the environment stands up before the first real image is pushed by CI.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Port the backend container listens on.')
param containerTargetPort int = 3000

// ── Naming ───────────────────────────────────────────────────────────────────
var suffix = uniqueString(resourceGroup().id, environmentName)
var nameBase = '${namePrefix}-${environmentName}'
var globalName = toLower('${namePrefix}${environmentName}${suffix}')

// ── Observability ────────────────────────────────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${nameBase}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${nameBase}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ── Managed identity (breaks the Key Vault / ACR ordering cycle) ─────────────
resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${nameBase}'
  location: location
}

// ── Key Vault (secrets + KMS-managed keys) ──────────────────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: take('kv-${namePrefix}${environmentName}${suffix}', 24)
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: environmentName == 'prod' ? 90 : 7
    // Purge protection is irreversible — only enforce it in production so dev
    // vaults can be freely deleted and recreated.
    enablePurgeProtection: environmentName == 'prod' ? true : null
    publicNetworkAccess: 'Enabled'
  }
}

// Key Vault Secrets User — lets the backend identity read secrets at runtime.
resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, uami.id, 'kv-secrets-user')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6'
    )
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── PostgreSQL Flexible Server ──────────────────────────────────────────────
var postgresSku = environmentName == 'prod' ? 'Standard_D2ds_v5' : 'Standard_B1ms'
var postgresTier = environmentName == 'prod' ? 'GeneralPurpose' : 'Burstable'

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'psql-${nameBase}-${suffix}'
  location: location
  sku: { name: postgresSku, tier: postgresTier }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: environmentName == 'prod' ? 35 : 7
      geoRedundantBackup: environmentName == 'prod' ? 'Enabled' : 'Disabled'
    }
    highAvailability: {
      mode: environmentName == 'prod' ? 'ZoneRedundant' : 'Disabled'
    }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'vigiscam'
}

// Phase-0 firewall: allow other Azure services. Phase 1 replaces this with a
// private endpoint and removes public access.
resource postgresAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ── Redis (cache, real-time state, queue backing) ───────────────────────────
resource redis 'Microsoft.Cache/redis@2024-03-01' = {
  name: 'redis-${nameBase}-${suffix}'
  location: location
  properties: {
    sku: {
      name: environmentName == 'prod' ? 'Standard' : 'Basic'
      family: 'C'
      capacity: environmentName == 'prod' ? 1 : 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
  }
}

// ── Storage (encrypted evidence blobs) ──────────────────────────────────────
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take('st${globalName}', 24)
  location: location
  sku: { name: environmentName == 'prod' ? 'Standard_GRS' : 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    encryption: {
      services: { blob: { enabled: true } }
      keySource: 'Microsoft.Storage'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource evidenceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'evidence'
  properties: { publicAccess: 'None' }
}

// ── Container Registry ──────────────────────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: take('acr${globalName}', 50)
  location: location
  sku: { name: environmentName == 'prod' ? 'Standard' : 'Basic' }
  properties: {
    adminUserEnabled: false
  }
}

// AcrPull — lets the backend identity pull images.
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, uami.id, 'acr-pull')
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    )
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Connection strings ──────────────────────────────────────────────────────
// Phase 0 stores these as Container App native secrets (set at deploy time,
// never in source control). Phase 1 hardening moves them into the Key Vault
// that is already provisioned above (vault + access role are ready).
var databaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/vigiscam?sslmode=require'
var redisUrl = 'rediss://:${redis.listKeys().primaryKey}@${redis.properties.hostName}:6380'

// ── Container Apps environment + the backend app ────────────────────────────
resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${nameBase}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource backendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${nameBase}-backend'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${uami.id}': {} }
  }
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: containerTargetPort
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: uami.id
        }
      ]
      secrets: [
        { name: 'database-url', value: databaseUrl }
        { name: 'redis-url', value: redisUrl }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: containerImage
          resources: {
            cpu: json(environmentName == 'prod' ? '1.0' : '0.5')
            memory: environmentName == 'prod' ? '2Gi' : '1Gi'
          }
          env: [
            // Deployed containers always run in production mode (real JSON logs,
            // no dev-only dependencies). The dev/staging/prod tier is conveyed
            // by resource naming, not by NODE_ENV.
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: string(containerTargetPort) }
            { name: 'API_PREFIX', value: 'api' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'REDIS_URL', secretRef: 'redis-url' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
          ]
        }
      ]
      scale: {
        minReplicas: environmentName == 'prod' ? 2 : 1
        maxReplicas: environmentName == 'prod' ? 10 : 3
      }
    }
  }
  dependsOn: [
    acrPull
  ]
}

// ── Outputs ──────────────────────────────────────────────────────────────────
output backendUrl string = 'https://${backendApp.properties.configuration.ingress.fqdn}'
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output keyVaultName string = keyVault.name
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
output containerAppName string = backendApp.name
output resourceGroupName string = resourceGroup().name
