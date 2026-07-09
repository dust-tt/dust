import { MCPError } from "@app/lib/actions/mcp_errors";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";

// Shared error mapping for the db_* tools: model-correctable refusals (bad path, bad schema
// file, destructive/disallowed DDL, bad SQL) surface untracked; everything else (sandbox
// unavailable, infrastructure failures) stays tracked.
export function toDbMCPError(error: SandboxFunctionError): MCPError {
  return new MCPError(error.message, {
    tracked:
      error.code !== "reconcile_blocked" && error.code !== "invalid_path",
  });
}
