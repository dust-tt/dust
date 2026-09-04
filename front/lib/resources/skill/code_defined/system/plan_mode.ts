import {
  CLOSE_PLAN_TOOL_NAME,
  CREATE_PLAN_TOOL_NAME,
  EDIT_PLAN_TOOL_NAME,
  PLAN_MODE_SERVER_NAME,
} from "@app/lib/api/actions/servers/plan_mode/metadata";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { SystemSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

const ASK_USER_QUESTION_TOOL_NAME = "ask_user_question";

const PLAN_MODE_INSTRUCTIONS = `
Plan Mode lets you maintain a live \`plan.md\` the user can follow as you work. Think of it as a shared progress view for substantial work, not just an approval gate. On a long task, the user sees where you are without having to ask. On a short one, it is pure overhead.

**If the user explicitly asks for a plan** (e.g. "use plan mode", "plan this for me", "draft a plan before you do anything"), always call \`${CREATE_PLAN_TOOL_NAME}\`, even if the task looks small to you. This overrides everything below.

**Otherwise, call \`${CREATE_PLAN_TOOL_NAME}\` only when the work is genuinely multi-step**: a change spanning several files or systems, research across several sources, or a task whose steps you will have to sequence and revisit rather than run straight through. Rule of thumb: if you expect to be done within about five tool calls, there is nothing worth planning. The test is whether the plan tells the user something they don't already know — if it would just restate their request as a checklist, don't create one.

**When in doubt, skip it.** A plan the user reads only after the work is already finished is noise, not transparency: they get a card to track for nothing. Prefer doing the work and reporting the result.

**Skip plan mode entirely** for questions and lookups, single edits or fixes, pure clarification exchanges, and follow-ups that just tweak something you already produced. Answer length is not the signal — a long written answer produced in one shot needs no plan.

**If the work turns out bigger than you expected mid-turn, call \`${CREATE_PLAN_TOOL_NAME}\` then.** The bar is the size of the work, not when you discovered it.

Exactly one active plan is allowed per conversation. If a plan already exists in this conversation (you can see it in the attachments), do NOT call \`${CREATE_PLAN_TOOL_NAME}\` again; use \`${EDIT_PLAN_TOOL_NAME}\` to iterate on the existing one.

**Keep the plan updated as you work**: use \`${EDIT_PLAN_TOOL_NAME}\` to tick off completed tasks (\`1. [x]\`), add tasks that emerge, or revise the approach. Keep the existing marker style when editing a plan. A blocked task stays unchecked; append the reason to its text, e.g. \`1. [ ] Deploy the fix (blocked: waiting on approval)\`. Do not invent other markers such as \`[!]\`, they are not Markdown and render as plain text. The UI renders the plan live, so frequent small edits are a delight for the user, not a cost.

Clarifying questions go through \`${ASK_USER_QUESTION_TOOL_NAME}\`: use it liberally before drafting the plan and whenever ambiguity arises mid-execution.

**Approval**: plan mode has no dedicated approval tool. When you need explicit sign-off before executing, you MUST request it through \`${ASK_USER_QUESTION_TOOL_NAME}\` with a question like "Approve this plan?" and options such as "Approve" and "Reject". Never ask for approval in your normal response text: a plain sentence like "Do you approve?" gives the user no clear choice, is not an approval gate, and does not pause for a decision. If you are seeking approval, the LAST thing you do in the turn is the \`${ASK_USER_QUESTION_TOOL_NAME}\` call, not a written question.
- Request approval this way when the user explicitly asked for plan mode (see above): ask once the plan is populated and before starting execution.
- Otherwise it is optional: only ask if the stakes warrant a human checkpoint (irreversible actions, big scope, ambiguous intent). For transparency-only flows, skip approval and just keep editing the plan as you execute.
- Only ask for approval when plan.md is ready. Do not ask with an incomplete plan.

**If the user does NOT approve: STOP.** Do NOT proceed with execution under any circumstance. Do NOT call research, side-effect, or write tools. Ask again via \`${ASK_USER_QUESTION_TOOL_NAME}\` what to change, offering options like a concrete revision direction, "proceed anyway without approval", or "drop the plan". Based on the answer:
- If they give you a revision, revise the plan via \`${EDIT_PLAN_TOOL_NAME}\` and ask for approval again.
- If they say to proceed anyway, continue execution without re-asking (keep updating plan.md via \`${EDIT_PLAN_TOOL_NAME}\` for transparency).
- If they ask to drop the plan, call \`${CLOSE_PLAN_TOOL_NAME}\`.

**Closing the plan (\`${CLOSE_PLAN_TOOL_NAME}\`)** in two cases:
1. The user explicitly asks to drop it (e.g. "never mind", "forget about it").
2. **All tasks are done (\`[x]\`) AND the user's new turn moves past the plan's scope** — they thank you, wrap up, or pivot to a different topic that isn't extending the plan. Close it before continuing so the completed plan doesn't linger in the UI.

**Bias toward keeping the plan alive** when the new user turn is ambiguous or could plausibly extend the current plan. If they say "also do Y" or "one more thing", that's an extension — call \`${EDIT_PLAN_TOOL_NAME}\` to add tasks, do NOT close. Premature close mid-thread is worse UX than a plan card lingering for one extra turn.

Do NOT close to handle revisions; use \`${EDIT_PLAN_TOOL_NAME}\` to iterate instead.
`;

export const planModeSkill = {
  sId: "plan_mode",
  kind: "system",
  name: "Plan Mode",
  userFacingDescription:
    "Let agents maintain a live plan.md the user can follow as work progresses.",
  agentFacingDescription:
    "Create and maintain a plan.md for genuinely multi-step tasks to give the user visibility.",
  instructions: PLAN_MODE_INSTRUCTIONS,
  mcpServers: [{ name: PLAN_MODE_SERVER_NAME }],
  version: 3,
  icon: "ActionDocumentTextIcon",
  isRestricted: async (auth: Authenticator) => {
    const flags = await getFeatureFlags(auth);
    return !flags.includes("plan_mode");
  },
} as const satisfies SystemSkillDefinition;
