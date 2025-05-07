-- Add Dust App specific columns to the existing table
ALTER TABLE public.agent_mcp_server_configurations
  ADD COLUMN "appWorkspaceId" VARCHAR(255) NULL,
  ADD COLUMN "appId" VARCHAR(255) NULL;