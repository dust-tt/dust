import type { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import assert from "assert";

/**
 * Function identifiers for the shared `tool.*` audit events. Function-initiated tool calls reuse
 * the agent-loop actions so admins read one stream; these keys stand in for the conversation and
 * agent-message identifiers the agent flavor carries.
 */
export function buildSandboxFunctionAuditMetadata(
  invocation: SandboxFunctionInvocationResource
): Record<string, string> {
  const { sandboxFunction } = invocation;
  const frame = sandboxFunction.frame;

  if (frame) {
    assert(
      sandboxFunction.publicationId !== null,
      "Frame functions must belong to a publication."
    );

    return {
      frame_id: frame.sId,
      frame_function_id: sandboxFunction.sId,
      frame_function_name: sandboxFunction.slug,
      frame_publication_id: sandboxFunction.publicationId,
      invocation_id: invocation.sId,
      ...(invocation.origin ? { invocation_origin: invocation.origin } : {}),
    };
  }

  return {
    pod_id: sandboxFunction.space.sId,
    pod_function_id: sandboxFunction.sId,
    pod_function_slug: sandboxFunction.slug,
    invocation_id: invocation.sId,
    // Null for invocations recorded before origins were tracked.
    ...(invocation.origin ? { invocation_origin: invocation.origin } : {}),
  };
}
