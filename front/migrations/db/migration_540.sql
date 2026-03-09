-- Migration created on Mar 09, 2026
-- Change version column on remote_mcp_servers to TEXT to avoid
-- "value too long for type character varying(255)" errors when remote
-- MCP servers return long version strings.
ALTER TABLE "remote_mcp_servers"
  ALTER COLUMN "version" TYPE TEXT;
