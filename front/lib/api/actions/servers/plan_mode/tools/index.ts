import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { PLAN_MODE_TOOLS_METADATA } from "@app/lib/api/actions/servers/plan_mode/metadata";
import {
  createPlan,
  findActivePlan,
  getPlanContent,
  isApprovalRequestStale,
  markPlanApproved,
  markPlanClosed,
  withPlanModeLock,
  writePlanContent,
} from "@app/lib/api/assistant/plan_mode";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import { getUpdatedContentAndOccurrences } from "@app/lib/api/files/utils";
import type { ConversationPlanResource } from "@app/lib/resources/conversation_plan_resource";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

async function publishPlanUpdated(
  conversationId: string,
  plan: ConversationPlanResource
): Promise<void> {
  await publishConversationEvent(
    {
      type: "plan_updated",
      created: Date.now(),
      conversationId,
      version: plan.version,
      isClosed: plan.isClosed,
    },
    { conversationId }
  );
}

const handlers: ToolHandlers<typeof PLAN_MODE_TOOLS_METADATA> = {
  create_plan: async (_params, { auth, agentLoopContext }) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("Agent loop context is required."));
    }
    const { conversation } = agentLoopContext.runContext;

    return withPlanModeLock(conversation.sId, async () => {
      const existing = await findActivePlan(auth, conversation);
      if (existing) {
        return new Err(
          new MCPError(
            "A plan already exists for this conversation. Use `edit_plan` to update it, or " +
              "`close_plan` first if the user explicitly wants to drop it and start over."
          )
        );
      }

      const planRes = await createPlan(auth, { conversation });
      if (planRes.isErr()) {
        return new Err(new MCPError(planRes.error.message));
      }

      await publishPlanUpdated(conversation.sId, planRes.value);

      return new Ok([
        {
          type: "text",
          text: `plan.md created. Populate it via \`edit_plan\`.`,
        },
      ]);
    });
  },

  edit_plan: async ({ old_string, new_string }, { auth, agentLoopContext }) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("Agent loop context is required."));
    }
    const { conversation } = agentLoopContext.runContext;

    try {
      return await withPlanModeLock(conversation.sId, async () => {
        const plan = await findActivePlan(auth, conversation);
        if (!plan) {
          return new Err(
            new MCPError(
              "No active plan.md for this conversation. Call `create_plan` first to start one."
            )
          );
        }

        const contentRes = await getPlanContent(auth, conversation, plan);
        if (contentRes.isErr()) {
          return new Err(new MCPError("Failed to read plan.md."));
        }
        const currentContent = contentRes.value;
        if (currentContent === null) {
          return new Err(
            new MCPError("plan.md content is missing and cannot be edited.")
          );
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

        const writeRes = await writePlanContent(
          auth,
          conversation,
          plan,
          updatedContent
        );
        if (writeRes.isErr()) {
          return new Err(new MCPError(writeRes.error.message));
        }

        await plan.incrementVersion();

        await publishPlanUpdated(conversation.sId, plan);

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

  request_plan_approval: async ({ summary }, { auth, agentLoopContext }) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("Agent loop context is required."));
    }
    const { conversation, currentAction } = agentLoopContext.runContext;

    // Runs only after the user approves (stake "high"); on reject it is never called.
    return withPlanModeLock(conversation.sId, async () => {
      const plan = await findActivePlan(auth, conversation);
      if (!plan) {
        return new Err(
          new MCPError(
            "No active plan.md for this conversation. `request_plan_approval` requires an " +
              "existing plan — create one first with `create_plan` and populate it."
          )
        );
      }

      // The pending card isn't tied to a plan row/version, so reject it if the plan was edited or
      // replaced since the request (`currentAction.createdAt` is when approval was requested).
      if (
        isApprovalRequestStale(plan, {
          requestedAtMs: currentAction.createdAt,
        })
      ) {
        return new Err(
          new MCPError(
            "The plan changed since approval was requested (it was edited or replaced), so this " +
              "approval is no longer valid. Call `request_plan_approval` again for the current plan."
          )
        );
      }

      const user = auth.user();
      if (!user) {
        return new Err(
          new MCPError("No user on auth context; cannot record approval.")
        );
      }

      // `user` is the triggering user message's author. validate-action requires that to be the
      // approver, so they match today; revisit if validate-action is opened up.
      const approval = await markPlanApproved(plan, user.id);
      if (!approval) {
        return new Err(
          new MCPError(
            "The plan was closed while approval was pending. It cannot be approved anymore."
          )
        );
      }

      await publishPlanUpdated(conversation.sId, plan);

      return new Ok([
        {
          type: "text",
          text:
            `Plan approved by ${user.sId} at ${approval.approvedAt.toISOString()} ` +
            `(plan.md version ${approval.approvedVersion}). Proceed with execution: work ` +
            `through the tasks in plan.md, using \`edit_plan\` to check them off as you ` +
            `go. Stay within the approved scope; if scope changes, surface it to the user ` +
            `before acting.` +
            (summary ? `\n\nSummary shown to user: ${summary}` : ""),
        },
      ]);
    });
  },

  close_plan: async ({ reason }, { auth, agentLoopContext }) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("Agent loop context is required."));
    }
    const { conversation } = agentLoopContext.runContext;

    return withPlanModeLock(conversation.sId, async () => {
      const plan = await findActivePlan(auth, conversation);
      if (!plan) {
        return new Err(
          new MCPError(
            "No active plan.md for this conversation. Nothing to close."
          )
        );
      }

      // Don't resolve any pending approval action here: the codebase only transitions blocked
      // actions to terminal via user action on the card, and a stale card degrades gracefully
      // (markPlanApproved no-ops on closed plans). Closing keeps the content; it only flips
      // `isClosed`.
      await markPlanClosed(plan);
      await publishPlanUpdated(conversation.sId, plan);

      if (reason) {
        logger.info(
          {
            conversationId: conversation.sId,
            reason,
          },
          "Plan closed by agent"
        );
      }

      return new Ok([
        {
          type: "text",
          text:
            "Plan closed. The plan.md is now hidden from the UI and will no longer be " +
            "referenced. If the user later asks for a new plan, call `create_plan` to " +
            "start a fresh one.",
        },
      ]);
    });
  },
};

export const TOOLS = buildTools(PLAN_MODE_TOOLS_METADATA, handlers);
