import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { dbErrorToMCPError } from "@app/lib/api/actions/servers/pod_databases/tools/shared";
import { getPod } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { queryDatabaseOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { Err, Ok } from "@app/types/shared/result";

export async function queryHandler(
  { database, sql }: { database: string; sql: string },
  { auth, toolContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getPod(auth, { toolContext });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const queryResult = await queryDatabaseOnSandbox(auth, {
    space: podResult.value.pod,
    database,
    sql,
  });
  if (queryResult.isErr()) {
    return new Err(dbErrorToMCPError(queryResult.error));
  }
  const { columns, rows, rowCount, truncated } = queryResult.value;

  const summary = `${rowCount} row${rowCount === 1 ? "" : "s"} (columns: ${columns.join(", ") || "none"})${
    truncated
      ? " — TRUNCATED at the row cap; narrow the query for the full result"
      : ""
  }`;

  return new Ok([
    { type: "text", text: summary },
    { type: "text", text: JSON.stringify(rows) },
  ]);
}
