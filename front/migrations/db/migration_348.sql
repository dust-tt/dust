-- Migration created on Aug 27, 2025
UPDATE agent_mcp_server_configurations
SET "additionalConfiguration"='{"channels": ["*"]}'
WHERE "internalMCPServerId" IS NOT NULL AND public.id_from_sid("internalMCPServerId")=18 AND "additionalConfiguration"='{}';