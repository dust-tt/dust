-- Add Dust App specific columns to the existing table
ALTER TABLE public.agent_mcp_server_configurations
  ADD COLUMN "appWorkspaceId" BIGINT NULL,
  ADD COLUMN "appId" BIGINT NULL;