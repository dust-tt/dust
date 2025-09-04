-- Migration created on Sep 04, 2025
UPDATE agent_mcp_server_configurations
SET "additionalConfiguration"='{}'
WHERE "internalMCPServerId" IS NOT NULL AND "additionalConfiguration"::text LIKE '%{"channels":%';