import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { PLAN_MODE_TOOLS_METADATA } from "@app/lib/api/actions/servers/plan_mode/metadata";
import {
  createPlanFile,
  getPlanFileFromMetadata,
  markPlanApproved,
  setConversationPlanMode,
} from "@app/lib/api/assistant/plan_mode";
import {
  getFileContent,
  getUpdatedContentAndOccurrences,
} from "@app/lib/api/files/utils";
import { executeWithLock } from "@app/lib/lock";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getConversationPlanMode } from "@app/types/assistant/conversation";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const handlers: ToolHandlers<typeof PLAN_MODE_TOOLS_METADATA> = {
  enter_plan_mode: async (_params, { auth, agentLoopContext }) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("Agent loop context is required."));
    }
    const { conversation, agentConfiguration } = agentLoopContext.runContext;

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    if (!conversationResource) {
      return new Err(new MCPError("Conversation not found."));
    }

    // Re-read the current metadata from DB rather than relying on the cached conversation, so we
    // correctly detect concurrent enter_plan_mode calls.
    if (getConversationPlanMode(conversationResource.metadata)) {
      return new Err(
        new MCPError(
          "Already in plan mode. Use `edit_plan` to update plan.md or `exit_plan_mode` to " +
            "submit it for approval."
        )
      );
    }

    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError(
          "Plan mode requires a human initiator. It cannot be entered from non-interactive " +
            "runs (triggers, scheduled tasks, API calls without a user)."
        )
      );
    }

    const planFile = await createPlanFile(auth, {
      conversationId: conversation.sId,
      agentConfigurationId: agentConfiguration.sId,
    });

    await setConversationPlanMode(auth, conversationResource.sId, {
      planFileId: planFile.sId,
      initiatedByUserId: user.sId,
    });

    const skeletonContent = await getFileContent(auth, planFile, "original");

    return new Ok([
      {
        type: "text",
        text: [
          "Entered plan mode. A fresh `plan.md` has been created for this conversation. You are",
          "now in the planning phase. Follow this contract for the rest of this turn and every",
          "subsequent turn until `exit_plan_mode` resolves:",
          "",
          "ALLOWED TOOLS (planning phase):",
          "- `edit_plan` — the ONLY tool you may use to write to `plan.md`. Every change to the",
          "  plan must go through this tool.",
          "- `ask_user_question` — use this liberally. See CLARIFYING QUESTIONS below.",
          "- Any read-only tool (web search, reading attached files, browsing).",
          "",
          "CLARIFYING QUESTIONS (strongly encouraged):",
          "Before drafting plan.md, ask the user 1-3 clarifying questions via",
          "`ask_user_question`. Even when the ask seems clear, there's almost always hidden",
          "scope, priority, or constraint that matters. Good questions target:",
          '- Scope ("should I cover X or is this out of scope?")',
          '- Priorities / tradeoffs ("optimize for speed or thoroughness?")',
          "- Constraints the user hasn't mentioned (time budget, required format, audience)",
          '- The definition of "done" for this task',
          "Skip only for truly unambiguous, narrowly-scoped asks. When in doubt, ask.",
          "",
          "FORBIDDEN IN PLANNING PHASE:",
          "- `file_generation` — DO NOT use this to write `plan.md` or any other file. The",
          "  plan.md managed by plan mode is the only plan file; a second one breaks the flow.",
          "- `skill_management` / `toolsets` — do not enable new skills or toolsets mid-plan.",
          "- Any tool that writes to external systems (send messages, create records, etc.).",
          "",
          "PLAN STRUCTURE (replace every `_Fill in_` placeholder via `edit_plan`):",
          "  # Title",
          "  ## Context    (why we're doing this — 1-2 paragraphs)",
          "  ## Tasks      (checkboxes: `- [ ]` / `- [x]` / `- [~]` / `- [!]`)",
          "",
          "You may add further sections if the task warrants them (e.g. constraints, open",
          "questions), but do not pad with boilerplate. Keep the plan tight.",
          "",
          "TURN DISCIPLINE:",
          "- Every turn must end with either `ask_user_question` or `exit_plan_mode`. Do not end",
          "  a turn silently.",
          "- Draft iteratively: get the structure right with `edit_plan`, then refine.",
          "- When plan.md is ready for the user to approve, call `exit_plan_mode`.",
          "",
          "PLANNING VS RESEARCH:",
          "- Plan mode is for producing an approvable plan, not for doing the research itself.",
          "- Save the bulk of any web research for the execution phase (after approval). During",
          "  planning, do only the minimum searching needed to structure the plan correctly.",
          "",
          "Current contents of plan.md (use these exact strings in `edit_plan old_string`):",
          "",
          "```markdown",
          skeletonContent ?? "",
          "```",
        ].join("\n"),
      },
    ]);
  },

  edit_plan: async ({ old_string, new_string }, { auth, agentLoopContext }) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("Agent loop context is required."));
    }
    const { conversation, agentConfiguration } = agentLoopContext.runContext;

    const planFile = await getPlanFileFromMetadata(auth, conversation.metadata);
    if (!planFile) {
      return new Err(
        new MCPError(
          "No plan.md found for this conversation. Call `enter_plan_mode` first."
        )
      );
    }

    try {
      return await executeWithLock(`file:edit:${planFile.sId}`, async () => {
        const currentContent = await getFileContent(auth, planFile, "original");
        if (currentContent === null) {
          return new Err(new MCPError("Failed to read plan.md."));
        }

        const { updatedContent, occurrences } = getUpdatedContentAndOccurrences(
          {
            oldString: old_string,
            newString: new_string,
            currentContent,
          }
        );

        if (occurrences === 0) {
          return new Err(
            new MCPError(
              `\`old_string\` not found in plan.md. Make sure it matches the file content ` +
                `exactly (including whitespace).`
            )
          );
        }
        if (occurrences > 1) {
          return new Err(
            new MCPError(
              `\`old_string\` matches ${occurrences} locations in plan.md. Provide a more ` +
                `specific string so it matches exactly once.`
            )
          );
        }

        await planFile.uploadContent(auth, updatedContent);

        if (
          planFile.useCaseMetadata?.lastEditedByAgentConfigurationId !==
          agentConfiguration.sId
        ) {
          await planFile.setUseCaseMetadata(auth, {
            ...planFile.useCaseMetadata,
            lastEditedByAgentConfigurationId: agentConfiguration.sId,
          });
        }

        return new Ok([
          {
            type: "text",
            text: `plan.md updated. Current contents:\n\n${updatedContent}`,
          },
        ]);
      });
    } catch (err) {
      return new Err(
        new MCPError(
          `plan.md is currently being edited by another operation: ${normalizeError(err).message}`
        )
      );
    }
  },

  exit_plan_mode: async ({ summary }, { auth, agentLoopContext }) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("Agent loop context is required."));
    }
    const { conversation } = agentLoopContext.runContext;

    // This handler only runs when the user has already approved the action via the standard MCP
    // tool-approval flow. On reject, the handler is never invoked; the agent sees a "denied"
    // result and stays in plan mode.
    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    if (!conversationResource) {
      return new Err(new MCPError("Conversation not found."));
    }

    const planMode = getConversationPlanMode(conversationResource.metadata);
    if (!planMode) {
      return new Err(
        new MCPError(
          "Not currently in plan mode. `exit_plan_mode` can only be called while planning."
        )
      );
    }

    const planFile = await getPlanFileFromMetadata(
      auth,
      conversationResource.metadata
    );
    if (!planFile) {
      return new Err(new MCPError("plan.md not found for this conversation."));
    }

    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError("No user on auth context; cannot record approval.")
      );
    }

    const approval = await markPlanApproved(auth, planFile, user.sId);
    // Do NOT clear planMode metadata here. The plan file sId must remain reachable during the
    // execution phase so the agent can keep editing plan.md (check off tasks). The transition
    // from planning to execution is signaled by planFile.useCaseMetadata.planModeLastApproval
    // being set, which the skill's fetchInstructions checks. planMode metadata is only
    // cleared by the cancel endpoint.

    return new Ok([
      {
        type: "text",
        text:
          `Plan approved by ${user.sId} at ${approval.approvedAt} ` +
          `(plan.md version ${approval.fileVersion}). ` +
          `Proceed with execution: work through the tasks in plan.md, using \`edit_plan\` to ` +
          `check them off as you go. Stay within the approved scope; if scope changes, surface ` +
          `it to the user before acting.` +
          (summary ? `\n\nSummary shown to user: ${summary}` : ""),
      },
    ]);
  },
};

export const TOOLS = buildTools(PLAN_MODE_TOOLS_METADATA, handlers);
