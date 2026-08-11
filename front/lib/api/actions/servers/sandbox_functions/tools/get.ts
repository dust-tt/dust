import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPod } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { Err, Ok } from "@app/types/shared/result";

export function formatSandboxFunction(fn: SandboxFunctionResource): string {
  return [
    `${fn.slug}: ${fn.description}`,
    `userIdentity: ${fn.userIdentity ?? "optional"}`,
    `executionMode: ${fn.executionMode}`,
    // The timestamp and full bundle hash identify the serving version: they match the publish
    // tool's echo and the hash stamped on invocations, so a caller can confirm which publish
    // serves. "null" only for functions last published before hashes existed.
    `updatedAt: ${fn.updatedAt.toISOString()}`,
    `bundleSha256: ${fn.bundleSha256 ?? "null"}`,
    `input: ${JSON.stringify(fn.inputSchema)}`,
    `output: ${JSON.stringify(fn.outputSchema)}`,
  ].join("\n");
}

export async function getHandler(
  { slug }: { slug: string },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getPod(auth, { toolContext: { runContext } });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const sandboxFunction = await SandboxFunctionResource.fetchBySpaceAndSlug(
    auth,
    podResult.value.pod,
    slug
  );
  if (!sandboxFunction) {
    return new Err(
      new MCPError(`No pod function with slug "${slug}" in this pod.`, {
        tracked: false,
      })
    );
  }

  return new Ok([
    { type: "text", text: formatSandboxFunction(sandboxFunction) },
  ]);
}
