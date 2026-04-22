import { ASK_USER_QUESTION_TOOLS_METADATA } from "@app/lib/api/actions/servers/ask_user_question/metadata";
import {
  CLOSE_PLAN_TOOL_NAME,
  CREATE_PLAN_TOOL_NAME,
  EDIT_PLAN_TOOL_NAME,
  PLAN_MODE_SERVER_NAME,
  REQUEST_PLAN_APPROVAL_TOOL_NAME,
} from "@app/lib/api/actions/servers/plan_mode/metadata";
import { findActivePlanFile } from "@app/lib/api/assistant/plan_mode";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { SystemSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";

const ASK_USER_QUESTION_TOOL_NAME =
  ASK_USER_QUESTION_TOOLS_METADATA.ask_user_question.name;

// Default reminder — returned when no active plan.md exists in the conversation.
const DEFAULT_REMINDER = `
Plan Mode lets you maintain a live \`plan.md\` the user can follow as you work. Think of it as a shared progress view, not just an approval gate. Using it is delightful UX: the user sees what you're doing without having to ask.

**Default behavior: call \`${CREATE_PLAN_TOOL_NAME}\` at the start of any non-trivial turn.** Treat plan mode as your first move unless the task is clearly trivial. "Non-trivial" includes: multi-step work, anything touching several files or systems, research that will span multiple tool calls, anything the user might plausibly want to follow along with.

**Stay in default mode (no plan) only for:** single-shot questions, quick lookups, one-tool-call answers, pure clarification exchanges. When in doubt, err on the side of creating a plan — the cost is one tool call, the upside is transparency.

Workflow: call \`${CREATE_PLAN_TOOL_NAME}\` first, then populate via successive \`${EDIT_PLAN_TOOL_NAME}\` calls as you understand the task and make progress.

Tools:
- \`${CREATE_PLAN_TOOL_NAME}\`: create plan.md with a seeded skeleton. One active plan per conversation.
- \`${EDIT_PLAN_TOOL_NAME}\`: substitution edit on the active plan. Use liberally during drafting AND execution.
- \`${REQUEST_PLAN_APPROVAL_TOOL_NAME}\`: human checkpoint. MANDATORY when the user explicitly asked for plan mode (e.g. "use plan mode", "plan this for me"). Otherwise optional — only if stakes warrant the user explicitly OK-ing before you proceed.
- \`${CLOSE_PLAN_TOOL_NAME}\`: retire the plan. Only call if the user explicitly asks to drop it.
`;

// Returned when an active plan.md exists. Works for both the drafting phase and the post-
// approval execution phase (the agent doesn't need to distinguish — it just keeps the plan
// updated).
const ACTIVE_PLAN_PROMPT = `
You have an active \`plan.md\` attached to this conversation. The user can see it live.

Keep it updated as you work:
- Use \`${EDIT_PLAN_TOOL_NAME}\` to tick off completed tasks (\`- [x]\`), mark blocked ones (\`- [!]\`), add tasks that emerge, or revise the approach.
- The UI renders the plan live — frequent small edits are a delight for the user, not a cost.

Clarifying questions go through \`${ASK_USER_QUESTION_TOOL_NAME}\` — use them liberally before drafting the plan and whenever ambiguity arises mid-execution.

**If the user explicitly asked for plan mode** (e.g. "use plan mode", "plan this for me"), you MUST call \`${REQUEST_PLAN_APPROVAL_TOOL_NAME}\` once the plan is populated and before starting execution. Explicit opt-in signals the user wants the formal approve-before-execute flow.

If plan mode was your own initiative (not user-requested) and the stakes warrant a human checkpoint (irreversible actions, big scope, ambiguous intent), call \`${REQUEST_PLAN_APPROVAL_TOOL_NAME}\` too. Otherwise approval is optional — skip it for transparency-only flows.

**If \`${REQUEST_PLAN_APPROVAL_TOOL_NAME}\` is REJECTED (tool result status: denied): STOP.** Do NOT proceed with execution under any circumstance. Do NOT call research, side-effect, or write tools.

Your next step MUST be to call \`${ASK_USER_QUESTION_TOOL_NAME}\` to ask the user what to change. Offer options like: a concrete revision direction, "proceed anyway without approval", or "drop the plan". Based on the user's answer:
- If they give you a revision, revise the plan via \`${EDIT_PLAN_TOOL_NAME}\` and call \`${REQUEST_PLAN_APPROVAL_TOOL_NAME}\` again.
- If they say to proceed anyway, continue execution without re-requesting approval (keep updating plan.md via \`${EDIT_PLAN_TOOL_NAME}\` for transparency).
- If they ask to drop the plan, call \`${CLOSE_PLAN_TOOL_NAME}\`.

If the user explicitly asks to drop the plan (e.g. "never mind", "forget about it"), call \`${CLOSE_PLAN_TOOL_NAME}\`. Otherwise do NOT close the plan — use \`${EDIT_PLAN_TOOL_NAME}\` to iterate.
`;

async function resolveInstructions(
  auth: Authenticator,
  agentLoopData: AgentLoopExecutionData | undefined
): Promise<string> {
  const conversationId = agentLoopData?.conversation?.sId;
  if (!conversationId) {
    return DEFAULT_REMINDER;
  }

  const planFile = await findActivePlanFile(auth, conversationId);
  return planFile ? ACTIVE_PLAN_PROMPT : DEFAULT_REMINDER;
}

export const planModeSkill = {
  sId: "plan_mode",
  name: "Plan Mode",
  userFacingDescription:
    "Let agents maintain a live plan.md the user can follow, with an optional approval step for risky work.",
  agentFacingDescription:
    "Create and maintain a plan.md for non-trivial tasks to give the user visibility. Optionally request approval for risky steps.",
  fetchInstructions: async (
    auth: Authenticator,
    {
      agentLoopData,
    }: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData }
  ) => resolveInstructions(auth, agentLoopData),
  mcpServers: [{ name: PLAN_MODE_SERVER_NAME }],
  version: 1,
  icon: "ActionDocumentTextIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);
    return !flags.includes("plan_mode");
  },
} as const satisfies SystemSkillDefinition;
