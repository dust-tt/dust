import type { DustPodConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getWritablePodContext } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { toDbMCPError } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_errors";
import type { ReconcileDatabaseResult } from "@app/lib/api/sandbox_functions/dsbx_db";
import { reconcileDatabaseFromPodPath } from "@app/lib/api/sandbox_functions/dsbx_db";
import { Err, Ok } from "@app/types/shared/result";

export function formatReconcileResult(result: ReconcileDatabaseResult): string {
  const { database } = result;
  const header = result.created
    ? `Database "${database}" created.`
    : `Database "${database}" reconciled.`;
  const body =
    result.statements.length === 0
      ? "No schema changes to apply."
      : `Applied:\n${result.statements.map((statement) => `- ${statement}`).join("\n")}`;
  return `${header}\n${body}`;
}

export async function dbReconcileHandler(
  {
    database,
    path,
    dustPod,
  }: { database: string; path: string; dustPod?: DustPodConfigurationType },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getWritablePodContext(auth, {
    toolContext: { runContext },
    dustPod,
  });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const result = await reconcileDatabaseFromPodPath(auth, {
    space: podResult.value.pod,
    database,
    path,
  });
  if (result.isErr()) {
    return new Err(toDbMCPError(result.error));
  }

  // The name in the message is the resolved on-disk one, which is what db_query and db_schema
  // address the database by; it carries the app prefix the caller's name did not.
  return new Ok([{ type: "text", text: formatReconcileResult(result.value) }]);
}
