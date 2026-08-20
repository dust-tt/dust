import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPod } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { toDbMCPError } from "@app/lib/api/actions/servers/sandbox_functions/tools/db_errors";
import { getDatabaseSchemaOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { Err, Ok } from "@app/types/shared/result";

export async function dbSchemaHandler(
  { database }: { database: string },
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

  const result = await getDatabaseSchemaOnSandbox(auth, {
    space: podResult.value.pod,
    database,
  });
  if (result.isErr()) {
    return new Err(toDbMCPError(result.error));
  }

  return new Ok([{ type: "text", text: result.value }]);
}
