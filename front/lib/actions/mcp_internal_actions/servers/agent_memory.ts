import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer(AGENT_MEMORY_SERVER_NAME);

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
      withToolLogging(
        auth,
        { toolName: "memory_not_available", agentLoopContext },
        async () => {
          return new Err(
            new MCPError("No user memory available as there is no user authenticated.")
          );
        }
      )
    );
    return server;
  }

  const renderMemory = (
    memory: { lastUpdated: Date; content: string }[]
  ): {
    isError: boolean;
    content: { type: "text"; text: string }[];
  } => {
    if (memory.length === 0) {
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
          text: memory.map((entry, i) => `[${i}] ${entry.content}`).join("\n"),
        },
      ],
    };
  };

  server.tool(
    "retrieve",
    `Retrieve all agent memories${isUserScopedMemory ? " for the current user" : ""}`,
    {
      // shared_across_users:
      //   ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
    },
    withToolLogging(
      auth,
      { toolName: "retrieve", agentLoopContext },
      async () => {
        assert(
          agentLoopContext?.runContext,
          "agentLoopContext is required to run the memory retrieve tool"
        );
        const { agentConfiguration } = agentLoopContext.runContext;

        const memory = await AgentMemoryResource.retrieveMemory(auth, {
          agentConfiguration,
          user: user.toJSON(),
        });
        return new Ok(renderMemory(memory).content);
      }
    )
  );

  server.tool(
    "record_entries",
    `Record new memory entries${isUserScopedMemory ? " for the current user" : ""}`,
    {
      // shared_across_users:
      //   ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
      entries: z
        .array(z.string())
        .describe("The array of new memory entries to record."),
    },
    withToolLogging(
      auth,
      { toolName: "record_entries", agentLoopContext },
      async ({ entries }) => {
        assert(
          agentLoopContext?.runContext,
          "agentLoopContext is required to run the memory record_entries tool"
        );
        const { agentConfiguration } = agentLoopContext.runContext;

        const memory = await AgentMemoryResource.recordEntries(auth, {
          agentConfiguration,
          user: user.toJSON(),
          entries,
        });
        return new Ok(renderMemory(memory).content);
      }
    )
  );

  server.tool(
    "erase_entries",
    `Erase memory entries by indexes${isUserScopedMemory ? " for the current user" : ""}`,
    {
      // shared_across_users:
      //   ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
      indexes: z
        .array(z.number())
        .describe("The indexes of the memory entries to erase."),
    },
    withToolLogging(
      auth,
      { toolName: "erase_entries", agentLoopContext },
      async ({ indexes }) => {
        assert(
          agentLoopContext?.runContext,
          "agentLoopContext is required to run the memory erase_entries tool"
        );
        const { agentConfiguration } = agentLoopContext.runContext;

        const memory = await AgentMemoryResource.eraseEntries(auth, {
          agentConfiguration,
          user: user.toJSON(),
          indexes,
        });
        return new Ok(renderMemory(memory).content);
      }
    )
  );

  server.tool(
    "edit_entries",
    `Edit (overwrite) memory entries by indexes${isUserScopedMemory ? " for the current user" : ""}`,
    {
      // shared_across_users:
      //   ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
      edits: z
        .array(
          z.object({
            index: z
              .number()
              .describe("The index of the memory entry to overwrite."),
            content: z
              .string()
              .describe("The new content for the memory entry."),
          })
        )
        .describe("The array of memory entries to edit."),
    },
    withToolLogging(
      auth,
      { toolName: "edit_entries", agentLoopContext },
      async ({ edits }) => {
        assert(
          agentLoopContext?.runContext,
          "agentLoopContext is required to run the memory edit_entries tool"
        );
        const { agentConfiguration } = agentLoopContext.runContext;

        const memory = await AgentMemoryResource.editEntries(auth, {
          agentConfiguration,
          user: user.toJSON(),
          edits,
        });
        return new Ok(renderMemory(memory).content);
      }
    )
  );

  return server;
};

export default createServer;
