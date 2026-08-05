import type { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";

/**
 * Pod-function identifiers for the shared `tool.*` audit events. Function-initiated tool calls reuse
 * the agent-loop actions (`tool.executed`, `tool.approval_requested`, `tool.approval_resolved`) so
 * admins read one stream; these keys stand in for the `conversation_id` / `agent_message_id` the
 * agent flavor carries. Kept here so the keys stay in sync with the three schema files under
 * `front/admin/audit_log_schemas/`.
 */
export function buildSandboxFunctionAuditMetadata(
  invocation: SandboxFunctionInvocationResource
): Record<string, string> {
  const { sandboxFunction } = invocation;

  return {
    pod_id: sandboxFunction.space.sId,
    pod_function_id: sandboxFunction.sId,
    pod_function_slug: sandboxFunction.slug,
    invocation_id: invocation.sId,
    // Null for invocations recorded before origins were tracked.
    ...(invocation.origin ? { invocation_origin: invocation.origin } : {}),
  };
}
