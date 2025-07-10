import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  isServerSideMCPServerConfiguration,
  isServerSideMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "agent_memory",
  version: "1.0.0",
  description: "Long-term memory tools for agents.",
  authorization: null,
  icon: "ActionLightbulbIcon",
  documentationUrl: null,
};

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = new McpServer(serverInfo);

  let isUserScopedMemory = false;

  if (
    agentLoopContext &&
    agentLoopContext.listToolsContext &&
    isServerSideMCPServerConfiguration(
      agentLoopContext.listToolsContext.agentActionConfiguration
    ) &&
    agentLoopContext.listToolsContext.agentActionConfiguration
      .additionalConfiguration
  ) {
    isUserScopedMemory = agentLoopContext.listToolsContext
      .agentActionConfiguration.additionalConfiguration["shared_across_users"]
      ? false
      : true;
  }

  if (
    agentLoopContext &&
    agentLoopContext.runContext &&
    isServerSideMCPToolConfiguration(
      agentLoopContext.runContext.actionConfiguration
    ) &&
    agentLoopContext.runContext.actionConfiguration.additionalConfiguration
  ) {
    isUserScopedMemory = agentLoopContext.runContext.actionConfiguration
      .additionalConfiguration["shared_across_users"]
      ? false
      : true;
  }

  const user = auth.user();

  if (!user && isUserScopedMemory) {
    // If we are executed without users yet the memory is user scoped we show to the model that the
    // memory functions are not available.
    server.tool(
      "memory_not_available",
      "Memory is configured to be scoped to users but no user is currently authenticated.",
      {
        shared_across_users:
          ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
      },
      async () => {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "No user memory available as there is no user authenticated.",
            },
          ],
        };
      }
    );
    return server;
  }

  server.tool(
    "retrieve",
    `Retrieve all agent memories${isUserScopedMemory ? " for the current user" : ""}`,
    {
      shared_across_users:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
    },
    async (params, { authInfo }) => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "[1] Stan likes fish\n\n[2] the user paints.",
          },
        ],
      };
    }
  );

  server.tool(
    "record",
    `Record a new memory${isUserScopedMemory ? " for the current user" : ""}`,
    {
      shared_across_users:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
      content: z.string().describe("The content of the new memory entry."),
      index: z
        .number()
        .optional()
        .describe(
          "The index at which to insert the new memory entry. If not provided, it will be appended."
        ),
    },
    async ({ content, index }, { authInfo }) => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Memory inserted",
          },
        ],
      };
    }
  );

  server.tool(
    "erase",
    `Erase a memory${isUserScopedMemory ? " for the current user" : ""}`,
    {
      shared_across_users:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
      index: z.number().describe("The index of the memory entry to forget."),
    },
    async ({ text, index }, { authInfo }) => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Memory erased",
          },
        ],
      };
    }
  );

  server.tool(
    "overwrite",
    `Overwrite a memory${isUserScopedMemory ? " for the current user" : ""}`,
    {
      shared_across_users:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
      index: z.number().describe("The index of the memory entry to overwrite."),
      content: z.string().describe("The content to overwrite the memory with."),
    },
    async ({ text, index }, { authInfo }) => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Memory overwritten",
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;
