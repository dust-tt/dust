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
    return "No live databases in this pod";
  }

  const lines = databases.map((db) => `- ${db.name} (${db.sizeBytes} bytes)`);
  return [
    "Pod databases:",
    ...lines,
    "",
    "Use db_schema to inspect a database and db_query to run SQL against it.",
  ].join("\n");
}

export async function dbListHandler(
  _params: Record<string, never>,
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getPod(
    auth,
    { toolContext: { runContext } },
    {
      hiddenPodFallback: true,
    }
  );
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
