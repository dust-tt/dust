import type { DustPodConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getWritablePodContext } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { toDbMCPError } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_errors";
import type { QueryDatabaseResult } from "@app/lib/api/sandbox_functions/dsbx_db";
import { queryDatabaseOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { Err, Ok } from "@app/types/shared/result";

export function formatQueryResult(result: QueryDatabaseResult): string {
  // Plain DML returns no rows, only the affected count.
  if (result.changes !== null) {
    return `${result.changes} row${result.changes === 1 ? "" : "s"} changed`;
  }

  const header =
    `${result.rowCount} row${result.rowCount === 1 ? "" : "s"}` +
    (result.columns.length > 0
      ? ` — columns: ${result.columns.join(", ")}`
      : "");

  const lines = [header, JSON.stringify(result.rows)];
  if (result.note !== null) {
    lines.push(result.note);
  }
  return lines.join("\n");
}

export async function dbQueryHandler(
  {
    database,
    sql,
    dustPod,
  }: { database: string; sql: string; dustPod?: DustPodConfigurationType },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  // Write gate: db_query runs DML, not just reads.
  const podResult = await getWritablePodContext(auth, {
    toolContext: { runContext },
    dustPod,
  });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const result = await queryDatabaseOnSandbox(auth, {
    space: podResult.value.pod,
    database,
    sql,
  });
  if (result.isErr()) {
    return new Err(toDbMCPError(result.error));
  }

  return new Ok([{ type: "text", text: formatQueryResult(result.value) }]);
}
