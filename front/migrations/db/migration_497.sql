-- Migration to add credentialId column to mcp_server_connections table
-- for supporting key pair authentication as an alternative to OAuth

ALTER TABLE mcp_server_connections ADD COLUMN "credentialId" VARCHAR(255);
