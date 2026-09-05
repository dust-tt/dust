import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPod } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { toDbMCPError } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_errors";
import type { LiveDatabaseEntry } from "@app/lib/api/sandbox_functions/dsbx_db";
import { listDatabasesOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { Err, Ok } from "@app/types/shared/result";

export function formatDatabasesList(databases: LiveDatabaseEntry[]): string {
  if (databases.length === 0) {
    return "No project databases.";
  }

  const lines = databases.map((db) => `- ${db.name} (${db.sizeBytes} bytes)`);
  return [
    "Project databases:",
    ...lines,
    "",
    "Use db_schema to inspect one or db_query to run SQL.",
  ].join("\n");
}

export async function dbListHandler(
  _params: Record<string, never>,
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getPod(auth, { toolContext: { runContext } });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const result = await listDatabasesOnSandbox(auth, {
    space: podResult.value.pod,
  });
  if (result.isErr()) {
    return new Err(toDbMCPError(result.error));
  }

  return new Ok([{ type: "text", text: formatDatabasesList(result.value) }]);
}
