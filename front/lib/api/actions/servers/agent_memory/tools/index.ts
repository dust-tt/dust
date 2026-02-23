import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  AGENT_MEMORY_COMPACT_TOOL_NAME,
  AGENT_MEMORY_EDIT_TOOL_NAME,
  AGENT_MEMORY_ERASE_TOOL_NAME,
  AGENT_MEMORY_RECORD_TOOL_NAME,
  AGENT_MEMORY_RETRIEVE_TOOL_NAME,
  AGENT_MEMORY_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/agent_memory/metadata";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

const renderMemory = (
  memory: { lastUpdated: Date; content: string }[]
): Result<CallToolResult["content"], MCPError> => {
  if (memory.length === 0) {
    return new Ok([
      {
        type: "text" as const,
        text: "(memory empty)",
      },
    ]);
  }

  return new Ok([
    {
      type: "text" as const,
      text: memory.map((entry, i) => `[${i}] ${entry.content}`).join("\n"),
    },
  ]);
};

const handlers: ToolHandlers<typeof AGENT_MEMORY_TOOLS_METADATA> = {
  [AGENT_MEMORY_RETRIEVE_TOOL_NAME]: async (_, { auth, agentLoopContext }) => {
    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError(
          "No user memory available as there is no user authenticated."
        )
      );
    }

    assert(
      agentLoopContext?.runContext,
      "agentLoopContext is required to run the memory retrieve tool"
    );
    const { agentConfiguration } = agentLoopContext.runContext;

    const memory = await AgentMemoryResource.retrieveMemory(auth, {
      agentConfiguration,
      user: user.toJSON(),
    });
    return renderMemory(memory);
  },

  [AGENT_MEMORY_RECORD_TOOL_NAME]: async (
    { entries },
    { auth, agentLoopContext }
  ) => {
    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError(
          "No user memory available as there is no user authenticated."
        )
      );
    }

    assert(
      agentLoopContext?.runContext,
      "agentLoopContext is required to run the memory record_entries tool"
    );
    const { agentConfiguration } = agentLoopContext.runContext;

    const result = await AgentMemoryResource.recordEntries(auth, {
      agentConfiguration,
      user: user.toJSON(),
      entries,
    });

    if (result.isErr()) {
      return new Err(new MCPError(result.error, { tracked: false }));
    }

    return renderMemory(result.value);
  },

  [AGENT_MEMORY_ERASE_TOOL_NAME]: async (
    { indexes },
    { auth, agentLoopContext }
  ) => {
    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError(
          "No user memory available as there is no user authenticated."
        )
      );
    }

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
    return renderMemory(memory);
  },

  [AGENT_MEMORY_EDIT_TOOL_NAME]: async (
    { edits },
    { auth, agentLoopContext }
  ) => {
    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError(
          "No user memory available as there is no user authenticated."
        )
      );
    }

    assert(
      agentLoopContext?.runContext,
      "agentLoopContext is required to run the memory edit_entries tool"
    );
    const { agentConfiguration } = agentLoopContext.runContext;

    const result = await AgentMemoryResource.editEntries(auth, {
      agentConfiguration,
      user: user.toJSON(),
      edits,
    });

    if (result.isErr()) {
      return new Err(new MCPError(result.error, { tracked: false }));
    }

    return renderMemory(result.value);
  },

  [AGENT_MEMORY_COMPACT_TOOL_NAME]: async (
    { edits },
    { auth, agentLoopContext }
  ) => {
    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError(
          "No user memory available as there is no user authenticated."
        )
      );
    }

    assert(
      agentLoopContext?.runContext,
      "agentLoopContext is required to run the memory compact_memory tool"
    );
    const { agentConfiguration } = agentLoopContext.runContext;

    const result = await AgentMemoryResource.editEntries(auth, {
      agentConfiguration,
      user: user.toJSON(),
      edits,
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Cannot compact memory entries. ${result.error}`, {
          tracked: false,
        })
      );
    }

    return renderMemory(result.value);
  },
};

export const TOOLS = buildTools(AGENT_MEMORY_TOOLS_METADATA, handlers);
