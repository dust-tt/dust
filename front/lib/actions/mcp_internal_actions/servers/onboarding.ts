import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { OnboardingTaskResource } from "@app/lib/resources/onboarding_task_resource";
import type { Result } from "@app/types";
import { Ok } from "@app/types";

const renderTasks = (
  tasks: OnboardingTaskResource[]
): Result<CallToolResult["content"], MCPError> => {
  return new Ok([
    {
      type: "text" as const,
      text: tasks.map((task) => task.toPrettyString()).join("\n"),
    },
  ]);
};

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("onboarding");
  const user = auth.user();

  if (!user) {
    server.tool(
      "onboarding_not_available",
      "Onboarding is configured to be scoped to users but no user is currently authenticated.",
      {},
      async () => {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "No onboarding tasks available as there is no user authenticated.",
            },
          ],
        };
      }
    );
    return server;
  }

  server.tool(
    "retrieve",
    `Retrieve all onboarding tasks for the current user`,
    {},
    withToolLogging(
      auth,
      { toolNameForMonitoring: "onboarding", agentLoopContext },
      async () => {
        const tasks =
          await OnboardingTaskResource.fetchAllForUserAndWorkspaceInAuth(auth);
        return renderTasks(tasks);
      }
    )
  );

  /**
   * Commented out for now as the tool to create new tasks is easy to misuse without proper context.
   * We will start with a limited set of tasks that we generate automatically based on the user's needs.
   */
  // server.tool(
  //   "create_task",
  //   `Create a new onboarding task for the current user`,
  //   {
  //     context: z.string().describe("The context of the new task."),
  //     kind: z.enum(ONBOARDING_TASK_KINDS).describe("The kind of the new task."),
  //     toolName: z
  //       .string()
  //       .describe("The tool name of the new task.")
  //       .nullable()
  //       .optional(),
  //   },
  //   withToolLogging(
  //     auth,
  //     { toolNameForMonitoring: "onboarding", agentLoopContext },
  //     async ({ context, kind, toolName }) => {
  //       const result = await OnboardingTaskResource.makeNew(auth, {
  //         context,
  //         kind,
  //         toolName,
  //       });

  //       return new Ok([
  //         {
  //           type: "text" as const,
  //           text: `New onboarding task created: ${result.sId}`,
  //         },
  //       ]);
  //     }
  //   )
  // );

  server.tool(
    "skip_task",
    `Skip a specific onboarding task for the current user`,
    {
      sId: z.string().describe("The sId of the task to skip."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "onboarding", agentLoopContext },
      async ({ sId }) => {
        const task = await OnboardingTaskResource.fetchById(auth, sId);
        if (!task) {
          return new Ok([
            {
              type: "text" as const,
              text: `Task ${sId} not found`,
            },
          ]);
        }
        await task.markSkipped();
        return new Ok([
          {
            type: "text" as const,
            text: `Task ${sId} skipped`,
          },
        ]);
      }
    )
  );

  server.tool(
    "complete_task",
    `Complete a specific onboarding task for the current user`,
    {
      sId: z.string().describe("The sId of the task to complete."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "onboarding", agentLoopContext },
      async ({ sId }) => {
        const task = await OnboardingTaskResource.fetchById(auth, sId);
        if (!task) {
          return new Ok([
            {
              type: "text" as const,
              text: `Task ${sId} not found`,
            },
          ]);
        }
        await task.markCompleted();
        return new Ok([
          {
            type: "text" as const,
            text: `Task ${sId} completed`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
