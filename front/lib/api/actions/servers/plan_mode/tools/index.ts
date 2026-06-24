import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { PLAN_MODE_TOOLS_METADATA } from "@app/lib/api/actions/servers/plan_mode/metadata";
import {
  closePlan,
  getActivePlanContent,
  withPlanModeLock,
  writePlanContent,
} from "@app/lib/api/assistant/plan_mode";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import { getUpdatedContentAndOccurrences } from "@app/lib/api/files/utils";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

async function publishPlanUpdated(
  conversationId: string,
  { isClosed }: { isClosed: boolean }
): Promise<void> {
  await publishConversationEvent(
    {
      type: "plan_updated",
      created: Date.now(),
      conversationId,
      isClosed,
    },
    { conversationId }
  );
}

const handlers: ToolHandlers<typeof PLAN_MODE_TOOLS_METADATA> = {
  create_plan: async ({ content }, { auth, agentLoopContext }) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("Agent loop context is required."));
    }
    const { conversation } = agentLoopContext.runContext;

    return withPlanModeLock(conversation.sId, async () => {
      const existing = await getActivePlanContent(auth, conversation);
      if (existing.isErr()) {
        return new Err(new MCPError(existing.error.message));
      }
      if (existing.value !== null) {
        return new Err(
          new MCPError(
            "A plan already exists for this conversation. Use `edit_plan` to update it, or " +
              "`close_plan` first if the user explicitly wants to drop it and start over."
          )
        );
      }

      const created = await writePlanContent(auth, conversation, content);
      if (created.isErr()) {
        return new Err(new MCPError(created.error.message));
      }

      await publishPlanUpdated(conversation.sId, { isClosed: false });

      return new Ok([
        {
          type: "text",
          text: `plan.md created. Current contents:\n\n${content}`,
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
        const contentRes = await getActivePlanContent(auth, conversation);
        if (contentRes.isErr()) {
          return new Err(new MCPError("Failed to read plan.md."));
        }
        const currentContent = contentRes.value;
        if (currentContent === null) {
          return new Err(
            new MCPError(
              "No active plan.md for this conversation. Call `create_plan` first to start one."
            )
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
          updatedContent
        );
        if (writeRes.isErr()) {
          return new Err(new MCPError(writeRes.error.message));
        }

        await publishPlanUpdated(conversation.sId, { isClosed: false });

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

  close_plan: async ({ reason }, { auth, agentLoopContext }) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("Agent loop context is required."));
    }
    const { conversation } = agentLoopContext.runContext;

    return withPlanModeLock(conversation.sId, async () => {
      const existing = await getActivePlanContent(auth, conversation);
      if (existing.isErr()) {
        return new Err(new MCPError(existing.error.message));
      }
      if (existing.value === null) {
        return new Err(
          new MCPError(
            "No active plan.md for this conversation. Nothing to close."
          )
        );
      }

      // Closing only moves plan.md into the archive folder; the content is preserved.
      const closed = await closePlan(auth, conversation);
      if (closed.isErr()) {
        return new Err(new MCPError(closed.error.message));
      }

      await publishPlanUpdated(conversation.sId, { isClosed: true });

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
            "Plan closed. The plan.md is now archived and will no longer be referenced. If the " +
            "user later asks for a new plan, call `create_plan` to start a fresh one.",
        },
      ]);
    });
  },
};

export const TOOLS = buildTools(PLAN_MODE_TOOLS_METADATA, handlers);
