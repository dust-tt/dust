import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  CLOSE_PLAN_TOOL_NAME,
  CREATE_PLAN_TOOL_NAME,
  EDIT_PLAN_TOOL_NAME,
  PLAN_FILE_NAME,
  PLAN_MODE_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/plan_mode/metadata";
import {
  closeActivePlan,
  getActivePlanContent,
  publishPlanUpdated,
  withPlanModeLock,
  writePlanContent,
} from "@app/lib/api/assistant/plan_mode";
import { getUpdatedContentAndOccurrences } from "@app/lib/api/files/utils";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

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
            `A plan already exists for this conversation. Use \`${EDIT_PLAN_TOOL_NAME}\` to update it, or ` +
              `\`${CLOSE_PLAN_TOOL_NAME}\` first if the user explicitly wants to drop it and start over.`
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
          text: `${PLAN_FILE_NAME} created. Current contents:\n\n${content}`,
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
          return new Err(new MCPError(`Failed to read ${PLAN_FILE_NAME}.`));
        }
        const currentContent = contentRes.value;
        if (currentContent === null) {
          return new Err(
            new MCPError(
              `No active ${PLAN_FILE_NAME} for this conversation. Call \`${CREATE_PLAN_TOOL_NAME}\` first to start one.`
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
              `\`old_string\` not found in ${PLAN_FILE_NAME}. Make sure it matches the file content ` +
                `exactly (including whitespace).`
            )
          );
        }
        if (occurrences > 1) {
          return new Err(
            new MCPError(
              `\`old_string\` matches ${occurrences} locations in ${PLAN_FILE_NAME}. Provide a more ` +
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
            text: `${PLAN_FILE_NAME} updated. Current contents:\n\n${updatedContent}`,
          },
        ]);
      });
    } catch (err) {
      return new Err(
        new MCPError(
          `${PLAN_FILE_NAME} is currently being edited by another operation: ${normalizeError(err).message}`
        )
      );
    }
  },

  close_plan: async ({ reason }, { auth, agentLoopContext }) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("Agent loop context is required."));
    }
    const { conversation } = agentLoopContext.runContext;

    const closed = await closeActivePlan(auth, conversation);
    if (closed.isErr()) {
      return new Err(new MCPError(closed.error.message));
    }
    if (!closed.value.closed) {
      return new Err(
        new MCPError(
          `No active ${PLAN_FILE_NAME} for this conversation. Nothing to close.`
        )
      );
    }

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
          `Plan closed. The ${PLAN_FILE_NAME} is now archived and will no longer be referenced. If the ` +
          `user later asks for a new plan, call \`${CREATE_PLAN_TOOL_NAME}\` to start a fresh one.`,
      },
    ]);
  },
};

export const TOOLS = buildTools(PLAN_MODE_TOOLS_METADATA, handlers);
