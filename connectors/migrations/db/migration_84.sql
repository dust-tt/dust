-- Add privateIntegrationCredentialId column to notion_connector_states table
ALTER TABLE notion_connector_states 
ADD COLUMN IF NOT EXISTS "privateIntegrationCredentialId" VARCHAR(255);