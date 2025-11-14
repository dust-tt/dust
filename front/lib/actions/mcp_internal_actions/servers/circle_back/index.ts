import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  CIRCLE_BACK_TO_CONVERSATION_TOOL_NAME,
  delayToMs,
  type DelayUnit,
  validateDelay,
} from "@app/lib/actions/mcp_internal_actions/servers/circle_back/types";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { launchAgentCircleBackWorkflow } from "@app/temporal/agent_circle_back/client";
import { Err, Ok } from "@app/types";

/**
 * Circle Back Server - Allows agents to schedule themselves to post a message
 * back to the current conversation after a specified delay.
 *
 * This enables agents to proactively follow up on tasks, reminders, or check-ins
 * without requiring user intervention.
 */
function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("circle_back");

  server.tool(
    CIRCLE_BACK_TO_CONVERSATION_TOOL_NAME,
    "Schedule yourself to post a message back to this conversation after a specified delay. " +
      "Use this to follow up on tasks, set reminders, or check back on progress. " +
      "The message will be posted automatically after the delay expires. " +
      "Minimum delay: 10 seconds, Maximum delay: 30 days.",
    {
      message: z
        .string()
        .min(1)
        .max(5000)
        .describe(
          "The message to post when circling back. IMPORTANT: Write this as if the USER is posting it, " +
            "not you. The message will appear as a user message in the conversation and will automatically " +
            "mention you (the agent) to trigger your response. " +
            "Good example: 'Hey, checking in on the API deployment we discussed earlier - is it complete?' " +
            "Bad example: 'I am checking back as requested' (sounds like an agent, not a user)"
        ),
      delay_value: z
        .number()
        .int()
        .positive()
        .describe(
          "The numeric value for the delay (e.g., 2 for '2 hours', 7 for '7 days')"
        ),
      delay_unit: z
        .enum(["seconds", "minutes", "hours", "days"] as [
          DelayUnit,
          ...DelayUnit[],
        ])
        .describe(
          "The unit of time for the delay. Options: 'seconds', 'minutes', 'hours', 'days'"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: CIRCLE_BACK_TO_CONVERSATION_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ message, delay_value, delay_unit }) => {
        const { conversation, agentConfiguration } =
          agentLoopContext?.runContext ?? {};

        if (!conversation || !agentConfiguration) {
          return new Err(
            new MCPError(
              "Conversation and agent context are required to schedule a circle back."
            )
          );
        }

        const owner = auth.getNonNullableWorkspace();

        // Get the user ID to send the message as
        const userId = auth.getNonNullableUser().sId;

        // Calculate delay in milliseconds
        const delayMs = delayToMs(delay_value, delay_unit);

        // Validate delay
        const validation = validateDelay(delayMs);
        if (!validation.valid) {
          return new Err(new MCPError(validation.error ?? "Invalid delay"));
        }

        // Launch the Temporal workflow
        const result = await launchAgentCircleBackWorkflow({
          workspaceId: owner.sId,
          conversationId: conversation.sId,
          agentConfigurationId: agentConfiguration.sId,
          userId,
          message,
          delayMs,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to schedule circle back: ${result.error.message}`,
              { tracked: true }
            )
          );
        }

        const workflowId = result.value;

        // Format a human-readable response
        const delayDescription =
          delay_value === 1
            ? `1 ${delay_unit.slice(0, -1)}` // Remove 's' for singular
            : `${delay_value} ${delay_unit}`;

        const responseText =
          `Successfully scheduled to circle back in ${delayDescription}. ` +
          `The following message will be posted: "${message.substring(0, 100)}${message.length > 100 ? "..." : ""}"`;

        return new Ok([
          {
            type: "text",
            text: responseText,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
