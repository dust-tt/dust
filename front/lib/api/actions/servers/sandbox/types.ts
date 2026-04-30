// Discriminator for `StepContext.resumeState` when the parent bash action is
// blocked because a child sandbox tool call requires approval. Intentionally
// distinct from the MCP server name (`SANDBOX_SERVER.serverInfo.name`) — the
// two strings happen to coincide today but mean different things.
export const SANDBOX_RESUME_STATE_TYPE = "sandbox" as const;

// `childActionId` is set by call_tool when a child sandbox action is created.
// It is informational only — concurrent sandbox tool calls in one bash command
// will overwrite each other's `childActionId`. The source of truth for the set
// of blocked children is a scan over `sandbox_mcp_actions` for the parent
// agent message (see `AgentMCPActionResource.listBlockedSandboxForAgentMessage`).
//
// `execId` is set by the bash tool handler when it pauses the sandbox after
// the grace period expires (slow path); read on resume to wait-and-collect
// the original process output.
//
// The `type` discriminator distinguishes this from run_agent's resume state
// (which has no `type` field) — order of guards in consumers matters.
export type SandboxResumeState = Record<string, unknown> & {
  type: typeof SANDBOX_RESUME_STATE_TYPE;
  childActionId: string;
  execId?: string;
};

export function isSandboxResumeState(
  state: unknown
): state is SandboxResumeState {
  return (
    typeof state === "object" &&
    state !== null &&
    "type" in state &&
    state.type === SANDBOX_RESUME_STATE_TYPE &&
    "childActionId" in state &&
    typeof state.childActionId === "string"
  );
}
