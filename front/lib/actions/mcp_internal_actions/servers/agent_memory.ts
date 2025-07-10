import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { z } from "zod";

import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "agent_memory",
  version: "1.0.0",
  description: "User-scoped long-term memory tools for agents.",
  authorization: null,
  icon: "ActionLightbulbIcon",
  documentationUrl: null,
};

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = new McpServer(serverInfo);

  const isUserScopedMemory = true;

  // For now we only support user-scoped memory, the code below allows to support agent-level memory
  // which is somewhat dangerous as it can leak data across users while use cases are not completely
  // obvious for now.

  // if (
  //   agentLoopContext &&
  //   agentLoopContext.listToolsContext &&
  //   isServerSideMCPServerConfiguration(
  //     agentLoopContext.listToolsContext.agentActionConfiguration
  //   ) &&
  //   agentLoopContext.listToolsContext.agentActionConfiguration
  //     .additionalConfiguration
  // ) {
  //   isUserScopedMemory = agentLoopContext.listToolsContext
  //     .agentActionConfiguration.additionalConfiguration["shared_across_users"]
  //     ? false
  //     : true;
  // }

  // if (
  //   agentLoopContext &&
  //   agentLoopContext.runContext &&
  //   isServerSideMCPToolConfiguration(
  //     agentLoopContext.runContext.actionConfiguration
  //   ) &&
  //   agentLoopContext.runContext.actionConfiguration.additionalConfiguration
  // ) {
  //   isUserScopedMemory = agentLoopContext.runContext.actionConfiguration
  //     .additionalConfiguration["shared_across_users"]
  //     ? false
  //     : true;
  // }

  const user = auth.user();

  if (!user /* && isUserScopedMemory*/) {
    // If we are executed without users yet the memory is user scoped we show to the model that the
    // memory functions are not available.
    server.tool(
      "memory_not_available",
      "Memory is configured to be scoped to users but no user is currently authenticated.",
      {
        // shared_across_users:
        //   ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
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
      // shared_across_users:
      //   ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
    },
    async () => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required where the tool is called"
      );
      const { agentConfiguration } = agentLoopContext.runContext;

      const memory = await AgentMemoryResource.retrieveMemories(auth, {
        agentConfiguration,
        forUser: user?.toJSON(),
      });

      if (!memory || memory.content.length === 0) {
        return {
          isError: false,
          content: [
            {
              type: "text",
              text: "(memory empty)",
            },
          ],
        };
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: memory.content
              .map((entry, i) => `[${i + 1}] ${entry}`)
              .join("\n---\n"),
          },
        ],
      };
    }
  );

  server.tool(
    "record",
    `Record a new memory${isUserScopedMemory ? " for the current user" : ""}`,
    {
      // shared_across_users:
      //   ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
      content: z.string().describe("The content of the new memory entry."),
      index: z
        .number()
        .optional()
        .describe(
          "The index at which to insert the new memory entry. If not provided, it will be appended."
        ),
    },
    async ({ content, index }) => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required where the tool is called"
      );
      const { agentConfiguration } = agentLoopContext.runContext;

      await AgentMemoryResource.recordMemory(auth, {
        agentConfiguration,
        forUser: user?.toJSON(),
        content,
        index,
      });

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Memory recorded.",
          },
        ],
      };
    }
  );

  server.tool(
    "erase",
    `Erase a memory${isUserScopedMemory ? " for the current user" : ""}`,
    {
      // shared_across_users:
      //   ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
      index: z.number().describe("The index of the memory entry to forget."),
    },
    async ({ index }) => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required where the tool is called"
      );
      const { agentConfiguration } = agentLoopContext.runContext;

      const result = await AgentMemoryResource.eraseMemory(auth, {
        agentConfiguration,
        forUser: user?.toJSON(),
        index,
      });

      if (result.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${result.error.message}`,
            },
          ],
        };
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Memory erased.",
          },
        ],
      };
    }
  );

  server.tool(
    "overwrite",
    `Overwrite a memory${isUserScopedMemory ? " for the current user" : ""}`,
    {
      // shared_across_users:
      //   ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
      index: z.number().describe("The index of the memory entry to overwrite."),
      content: z.string().describe("The content to overwrite the memory with."),
    },
    async ({ content, index }) => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required where the tool is called"
      );
      const { agentConfiguration } = agentLoopContext.runContext;

      const result = await AgentMemoryResource.overwriteMemory(auth, {
        agentConfiguration,
        forUser: user?.toJSON(),
        index,
        content,
      });

      if (result.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${result.error.message}`,
            },
          ],
        };
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Memory overwritten.",
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;
