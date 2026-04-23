import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { PLAN_MODE_TOOLS_METADATA } from "@app/lib/api/actions/servers/plan_mode/metadata";
import {
  createPlanFile,
  findActivePlanFile,
  markPlanApproved,
  markPlanClosed,
  withPlanModeLock,
} from "@app/lib/api/assistant/plan_mode";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import {
  getFileContent,
  getUpdatedContentAndOccurrences,
} from "@app/lib/api/files/utils";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

async function publishPlanUpdated(
  conversationId: string,
  planFile: FileResource
): Promise<void> {
  await publishConversationEvent(
    {
      type: "plan_updated",
      created: Date.now(),
      conversationId,
      planFileId: planFile.sId,
      version: planFile.version,
      isClosed: planFile.useCaseMetadata?.isPlanClosed === true,
      hasApproval: planFile.useCaseMetadata?.planModeLastApproval != null,
    },
    { conversationId }
  );
}

const handlers: ToolHandlers<typeof PLAN_MODE_TOOLS_METADATA> = {
  create_plan: async (_params, { auth, agentLoopContext }) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("Agent loop context is required."));
    }
    const { conversation, agentConfiguration } = agentLoopContext.runContext;

    return withPlanModeLock(conversation.sId, async () => {
      const existing = await findActivePlanFile(auth, conversation.sId);
      if (existing) {
        return new Err(
          new MCPError(
            "A plan already exists for this conversation. Use `edit_plan` to update it, or " +
              "`close_plan` first if the user explicitly wants to drop it and start over."
          )
        );
      }

      const planFile = await createPlanFile(auth, {
        conversationId: conversation.sId,
        agentConfigurationId: agentConfiguration.sId,
      });

      await publishPlanUpdated(conversation.sId, planFile);

      return new Ok([
        {
          type: "text",
          text: `plan.md created (file id: ${planFile.sId}). Populate it via \`edit_plan\`.`,
        },
      ]);
    });
  },

  edit_plan: async ({ old_string, new_string }, { auth, agentLoopContext }) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("Agent loop context is required."));
    }
    const { conversation, agentConfiguration } = agentLoopContext.runContext;

    try {
      return await withPlanModeLock(conversation.sId, async () => {
        const planFile = await findActivePlanFile(auth, conversation.sId);
        if (!planFile) {
          return new Err(
            new MCPError(
              "No active plan.md for this conversation. Call `create_plan` first to start one."
            )
          );
        }

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

        await publishPlanUpdated(conversation.sId, planFile);

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
    const { conversation } = agentLoopContext.runContext;

    // Handler only runs after user approval (tool stake is "high" → routes through the standard
    // MCP tool-approval flow). On reject, this function is never called; the agent sees the
    // action as denied.
    return withPlanModeLock(conversation.sId, async () => {
      const planFile = await findActivePlanFile(auth, conversation.sId);
      if (!planFile) {
        return new Err(
          new MCPError(
            "No active plan.md for this conversation. `request_plan_approval` requires an " +
              "existing plan — create one first with `create_plan` and populate it."
          )
        );
      }

      const user = auth.user();
      if (!user) {
        return new Err(
          new MCPError("No user on auth context; cannot record approval.")
        );
      }

      // Note: `user.sId` here is the author of the user message that triggered the agent loop,
      // not necessarily the person who clicked Approve. The existing validate-action check
      // requires those to be the same user, so in practice they match — but if validate-action
      // is ever opened up, this needs to become the actual approver's sId from the approval
      // callback.
      const approval = await markPlanApproved(auth, planFile, user.sId);
      if (!approval) {
        // Plan was closed between approval request and approval decision (close_plan race).
        return new Err(
          new MCPError(
            "The plan was closed while approval was pending. It cannot be approved anymore."
          )
        );
      }

      await publishPlanUpdated(conversation.sId, planFile);

      return new Ok([
        {
          type: "text",
          text:
            `Plan approved by ${user.sId} at ${approval.approvedAt} ` +
            `(plan.md version ${approval.fileVersion}). Proceed with execution: work ` +
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
      const planFile = await findActivePlanFile(auth, conversation.sId);
      if (!planFile) {
        return new Err(
          new MCPError(
            "No active plan.md for this conversation. Nothing to close."
          )
        );
      }

      // Intentionally do not resolve any pending `request_plan_approval` blocked action here.
      // The codebase only transitions blocked actions to terminal via user action on the
      // approval card itself (UI or email). If a stale card remains after close, existing
      // paths degrade gracefully: `markPlanApproved` already no-ops on closed plans, and a
      // reject goes through the normal relaunch flow.
      await markPlanClosed(auth, planFile);
      await publishPlanUpdated(conversation.sId, planFile);

      if (reason) {
        logger.info(
          {
            conversationId: conversation.sId,
            planFileId: planFile.sId,
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
