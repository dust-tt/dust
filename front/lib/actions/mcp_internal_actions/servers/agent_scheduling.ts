import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import ms from "ms";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { Message } from "@app/lib/models/assistant/conversation";
import { AgentScheduledExecutionResource } from "@app/lib/resources/agent_scheduled_execution_resource";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import { makeScheduledAgentLoopWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import { Err, normalizeError, Ok } from "@app/types";

const MAX_DELAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("agent_scheduling");

  server.tool(
    "schedule_agent_execution",
    "Schedule the execution of the current agent loop after a specified delay. " +
      "The agent will start executing after the delay has elapsed. " +
      "Maximum delay is 7 days. Accepts human-readable time strings like '2 hours', '30 minutes', '1 day'.",
    {
      delay: z
        .string()
        .describe(
          "The delay before starting the agent execution. " +
            "Accepts human-readable time strings like '2 hours', '30 minutes', '1 day', etc. " +
            "Maximum: 7 days."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "agent_scheduling",
        agentLoopContext,
      },
      async ({ delay }) => {
        if (!agentLoopContext?.runContext) {
          return new Err(
            new MCPError(
              "Agent scheduling is only available within an agent loop context."
            )
          );
        }

        const { agentMessage, conversation } = agentLoopContext.runContext;
        const agentMessageId = agentMessage.sId;
        const conversationId = conversation.sId;

        let delayMs: number;
        try {
          delayMs = ms(delay);
          if (isNaN(delayMs)) {
            return new Err(
              new MCPError(
                `Invalid delay format: "${delay}". Please use a valid time string like "2 hours", "30 minutes", "1 day".`
              )
            );
          }
        } catch (e) {
          const cause = normalizeError(e);
          return new Err(
            new MCPError(
              `Invalid delay format: "${delay}". Error: ${cause.message}`,
              { cause }
            )
          );
        }

        if (delayMs <= 0) {
          return new Err(new MCPError("Delay must be a positive duration."));
        }

        if (delayMs > MAX_DELAY_MS) {
          return new Err(
            new MCPError(
              `Delay exceeds maximum allowed duration of 7 days (${MAX_DELAY_MS}ms). Requested: ${delayMs}ms.`
            )
          );
        }

        if (!agentMessage.parentMessageId) {
          return new Err(
            new MCPError(
              "Cannot schedule agent execution: agent message has no parent user message."
            )
          );
        }

        const scheduledFor = new Date(Date.now() + delayMs);

        const owner = auth.getNonNullableWorkspace();
        const workflowId = makeScheduledAgentLoopWorkflowId({
          workspaceId: owner.sId,
          conversationId,
          agentMessageId,
          scheduledFor,
        });

        const userMessage = await Message.findOne({
          where: {
            sId: agentMessage.parentMessageId,
            conversationId: conversation.id,
          },
        });

        if (!userMessage) {
          return new Err(
            new MCPError(
              "Cannot schedule agent execution: user message not found."
            )
          );
        }

        const result = await launchAgentLoopWorkflow({
          auth,
          agentLoopArgs: {
            agentMessageId,
            agentMessageVersion: agentMessage.version,
            conversationId,
            conversationTitle: conversation.title,
            userMessageId: agentMessage.parentMessageId,
            userMessageVersion: 0,
          },
          startStep: 0,
          startDelay: delay,
        });

        if (result.isErr()) {
          const error = result.error;
          if (
            error instanceof DustError &&
            error.code === "agent_loop_already_running"
          ) {
            return new Err(
              new MCPError(
                "An agent loop is already running for this message. " +
                  "Cannot schedule another execution.",
                { tracked: false }
              )
            );
          }
          return new Err(
            new MCPError(`Failed to schedule agent execution: ${error.message}`)
          );
        }

        await AgentScheduledExecutionResource.makeNew(auth, {
          conversationId: conversation.id,
          agentMessageId: agentMessage.id,
          userMessageId: userMessage.id,
          workflowId,
          delayMs,
          scheduledFor,
          status: "scheduled",
          error: null,
        });

        return new Ok([
          {
            type: "text",
            text:
              "Agent execution scheduled successfully. " +
              `The agent will start in ${delay} (${delayMs}ms) at ${scheduledFor.toISOString()}.`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
