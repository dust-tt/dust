export const SANDBOX_MCP_SERVER_NAME = "sandbox";

// `childActionId` is set by call_tool when a child sandbox action is created.
// `execId` is set by the bash tool handler when it pauses the sandbox after
// the grace period expires (slow path); read on resume to wait-and-collect
// the original process output.
//
// The `type` discriminator distinguishes this from run_agent's resume state
// (which has no `type` field) — order of guards in consumers matters.
export type SandboxResumeState = Record<string, unknown> & {
  type: "sandbox";
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
    state.type === "sandbox" &&
    "childActionId" in state &&
    typeof state.childActionId === "string"
  );
}
