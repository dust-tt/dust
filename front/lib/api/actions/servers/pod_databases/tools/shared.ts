import { MCPError } from "@app/lib/actions/mcp_errors";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { FunctionManifests } from "@app/lib/api/sandbox_functions/manifests";
import { assertNever } from "@app/types/shared/utils/assert_never";

// Maps the dsbx-db domain errors to MCP errors: model-correctable refusals (unknown database,
// bad SQL, destructive schema) are tracked:false so the model self-corrects without alerting.
export function dbErrorToMCPError(error: SandboxFunctionError): MCPError {
  switch (error.code) {
    case "reconcile_blocked":
    case "invalid_path":
    case "invalid_contract":
    case "compat_blocked":
    case "build_failed":
    case "schema_extraction_failed":
    case "publish_conflict":
      return new MCPError(error.message, { tracked: false });
    case "sandbox_unavailable":
    case "reconcile_failed":
    case "internal":
      return new MCPError(error.message);
    default:
      return assertNever(error.code);
  }
}

// db -> sorted slugs of the published functions declaring it.
export function declaringFunctionsByDatabase(
  functions: { slug: string; manifests: FunctionManifests | null }[]
): Map<string, string[]> {
  const byDatabase = new Map<string, string[]>();
  for (const fn of functions) {
    for (const database of Object.keys(fn.manifests?.databases ?? {})) {
      const slugs = byDatabase.get(database);
      if (slugs) {
        slugs.push(fn.slug);
      } else {
        byDatabase.set(database, [fn.slug]);
      }
    }
  }
  for (const slugs of byDatabase.values()) {
    slugs.sort();
  }
  return byDatabase;
}
