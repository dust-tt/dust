import { ASK_USER_QUESTION_TOOLS_METADATA } from "@app/lib/api/actions/servers/ask_user_question/metadata";
import {
  EDIT_PLAN_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  PLAN_MODE_SERVER_NAME,
} from "@app/lib/api/actions/servers/plan_mode/metadata";
import {
  getPlanFileFromMetadata,
  isPlanApproved,
} from "@app/lib/api/assistant/plan_mode";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { getConversationPlanMode } from "@app/types/assistant/conversation";

const ASK_USER_QUESTION_TOOL_NAME =
  ASK_USER_QUESTION_TOOLS_METADATA.ask_user_question.name;

const DEFAULT_REMINDER = `
Plan Mode is a tool-driven planning workflow. Instead of writing a plan in chat, you call \`${ENTER_PLAN_MODE_TOOL_NAME}\` to create a proper \`plan.md\` file attached to the conversation. The user can then review, edit, and explicitly approve the plan before you execute. This is the mechanism — do not substitute it with a chat-message plan.

**Call \`${ENTER_PLAN_MODE_TOOL_NAME}\` as your FIRST tool call when any of these apply:**

1. The user explicitly asks for plan mode (examples: "use plan mode", "plan mode", "enter plan mode", "draft a plan first", "plan this before you do anything"). In this case, call \`${ENTER_PLAN_MODE_TOOL_NAME}\` immediately — do not argue, do not write a plan in chat, just call the tool.
2. The task is multi-step, touches multiple files or systems, or involves irreversible/externally-visible side effects (sending messages, writing to external systems, merging, making purchases).
3. The ask is ambiguous enough that guessing wrong would cost meaningful work.

**Do NOT write a plan as a chat-message when plan mode applies.** The whole point is that the user gets an approvable artifact before you act. Writing the plan in chat defeats the mechanism.

**Stay in default mode for:** trivial lookups, single-question asks, simple read-only research ("what is X?", "find an article about Y").
`;

const PLANNING_PROMPT = `
You are in plan mode.

Your job is to produce a clear, approvable plan in \`plan.md\` (attached to this conversation). Do not execute work yet. Use only read-only tools plus \`${EDIT_PLAN_TOOL_NAME}\` and \`${ASK_USER_QUESTION_TOOL_NAME}\`.

Workflow:
1. Understand. Explore the problem: read files, search, browse.
2. Clarify. Before drafting, ask the user 1-3 clarifying questions via \`${ASK_USER_QUESTION_TOOL_NAME}\`. Target scope, priorities, constraints, or what "done" looks like. Even when the ask seems clear, there's almost always hidden context. Skip only for truly unambiguous, narrow asks; when in doubt, ask.
3. Draft. Write plan.md via \`${EDIT_PLAN_TOOL_NAME}\`. Replace every \`_Fill in_\` placeholder; use the required structure (see below).
4. Review. Re-read the plan against the user's ask. Tighten scope, remove fluff.
5. Surface. Call \`${EXIT_PLAN_MODE_TOOL_NAME}\` once plan.md is ready. The user will approve or reject.

Required plan.md structure:
  # Title
  ## Context       (why we're doing this)
  ## Tasks         (checkbox list; use \`- [ ]\` / \`- [x]\` / \`- [~]\` / \`- [!]\`)

You may add further sections if the task warrants them (e.g. constraints, open questions), but do not pad with boilerplate. Keep the plan tight.

Every turn must end with either \`${ASK_USER_QUESTION_TOOL_NAME}\` or \`${EXIT_PLAN_MODE_TOOL_NAME}\`. Do not end a turn silently.

Do not call any tool that writes to external systems (send messages, create/update records, run non-readonly actions) while in plan mode. Save those for execution after approval.

The current \`plan.md\` is attached to this conversation and visible to you through the attachment-rendering path. Read it as needed.
`;

const EXECUTION_PROMPT = `
A plan has been approved for this conversation. The approved \`plan.md\` is attached.

As you execute:
- Work through the tasks in plan.md.
- Keep plan.md up to date via \`${EDIT_PLAN_TOOL_NAME}\`: check off completed tasks with \`- [x]\`, mark blocked tasks with \`- [!]\`.
- Stay within the scope the user approved. If scope needs to change, surface it and ask before acting.
- Do not call \`${ENTER_PLAN_MODE_TOOL_NAME}\` again for this task.
`;

async function resolveInstructions(
  auth: Authenticator,
  agentLoopData: AgentLoopExecutionData | undefined
): Promise<string> {
  if (!agentLoopData?.conversation?.sId) {
    return DEFAULT_REMINDER;
  }

  // Re-fetch to avoid stale cached metadata after enter_plan_mode or cancel.
  const conversation = await ConversationResource.fetchById(
    auth,
    agentLoopData.conversation.sId
  );
  const metadata = conversation?.metadata;
  const planMode = getConversationPlanMode(metadata);

  if (!planMode) {
    // Either never entered plan mode, or plan mode was cancelled.
    return DEFAULT_REMINDER;
  }

  // planMode metadata is present — either planning or post-approval execution. The file's
  // approval stamp tells us which.
  const planFile = await getPlanFileFromMetadata(auth, metadata);
  if (planFile && isPlanApproved(planFile)) {
    return EXECUTION_PROMPT;
  }

  return PLANNING_PROMPT;
}

export const planModeSkill = {
  sId: "plan_mode",
  name: "Plan Mode",
  userFacingDescription:
    "Let the agent plan non-trivial tasks in a `plan.md` before executing, with a human approval step.",
  agentFacingDescription:
    "Use plan mode for multi-step, irreversible, or ambiguous asks. Drafts a plan.md for user approval, then executes against it.",
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
  // Auto-enable so plan_mode's tools are always in the agent's tool registry when the feature
  // flag is on. Without this, the agent has to discover the skill via skill_management first,
  // which doesn't refresh the mid-turn tool registry — causing enter_plan_mode to resolve as
  // missing_action.
  isAutoEnabled: true,
} as const satisfies GlobalSkillDefinition;
