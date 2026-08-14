import { MCPError } from "@app/lib/actions/mcp_errors";
import type { DustPodConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPod } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { Err, Ok } from "@app/types/shared/result";

export function formatSandboxFunctionInvocations(
  slug: string,
  invocations: SandboxFunctionInvocationResource[]
): string {
  if (invocations.length === 0) {
    return `No invocations found for pod function "${slug}".`;
  }

  const serializedInvocations = invocations.map((invocation) =>
    invocation.toJSONForLLM()
  );

  return [
    `Recent invocations for pod function "${slug}" (newest first):`,
    JSON.stringify(serializedInvocations, null, 2),
  ].join("\n");
}

export async function inspectInvocationsHandler(
  {
    slug,
    limit,
    dustPod,
  }: { slug: string; limit: number; dustPod?: DustPodConfigurationType },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getPod(auth, {
    toolContext: { runContext },
    dustPod,
  });
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

  const invocations = await SandboxFunctionInvocationResource.listRecent(auth, {
    sandboxFunction,
    limit,
  });

  return new Ok([
    {
      type: "text",
      text: formatSandboxFunctionInvocations(slug, invocations),
    },
  ]);
}
