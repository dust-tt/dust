import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import {
  AGENT_MEMORY_COMPACT_TOOL_NAME,
  AGENT_MEMORY_EDIT_TOOL_NAME,
  AGENT_MEMORY_ERASE_TOOL_NAME,
  AGENT_MEMORY_RECORD_TOOL_NAME,
  AGENT_MEMORY_RETRIEVE_TOOL_NAME,
  AGENT_MEMORY_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/agent_memory/metadata";
import {
  USER_MEMORY_EDIT_TOOL_NAME,
  USER_MEMORY_SERVER_NAME,
} from "@app/lib/api/actions/servers/user_memory/metadata";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

const USER_MEMORY_EDIT_TOOL = getPrefixedToolName(
  USER_MEMORY_SERVER_NAME,
  USER_MEMORY_EDIT_TOOL_NAME
);

export const AGENT_MEMORY_WRITE_DISABLED_MESSAGE =
  `This tool is disabled. Use the \`${USER_MEMORY_EDIT_TOOL}\` tool to add or ` +
  `update the user's personal memory instead.`;

async function agentMemoryWriteDisabledError(
  auth: Authenticator
): Promise<MCPError | null> {
  if (await hasFeatureFlag(auth, "user_memory")) {
    return new MCPError(AGENT_MEMORY_WRITE_DISABLED_MESSAGE, {
      tracked: false,
    });
  }
  return null;
}

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
  [AGENT_MEMORY_RETRIEVE_TOOL_NAME]: async (_, { auth, runContext }) => {
    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError(
          "No user memory available as there is no user authenticated."
        )
      );
    }

    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");
    const { agentConfiguration } = runContext;

    const memory = await AgentMemoryResource.retrieveMemory(auth, {
      agentConfiguration,
      user: user.toJSON(),
    });
    return renderMemory(memory);
  },

  [AGENT_MEMORY_RECORD_TOOL_NAME]: async (
    { entries },
    { auth, runContext }
  ) => {
    const writeDisabled = await agentMemoryWriteDisabledError(auth);
    if (writeDisabled) {
      return new Err(writeDisabled);
    }

    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError(
          "No user memory available as there is no user authenticated."
        )
      );
    }

    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");
    const { agentConfiguration } = runContext;

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

  [AGENT_MEMORY_ERASE_TOOL_NAME]: async ({ indexes }, { auth, runContext }) => {
    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError(
          "No user memory available as there is no user authenticated."
        )
      );
    }

    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");
    const { agentConfiguration } = runContext;

    const memory = await AgentMemoryResource.eraseEntries(auth, {
      agentConfiguration,
      user: user.toJSON(),
      indexes,
    });
    return renderMemory(memory);
  },

  [AGENT_MEMORY_EDIT_TOOL_NAME]: async ({ edits }, { auth, runContext }) => {
    const writeDisabled = await agentMemoryWriteDisabledError(auth);
    if (writeDisabled) {
      return new Err(writeDisabled);
    }

    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError(
          "No user memory available as there is no user authenticated."
        )
      );
    }

    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");
    const { agentConfiguration } = runContext;

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

  [AGENT_MEMORY_COMPACT_TOOL_NAME]: async ({ edits }, { auth, runContext }) => {
    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError(
          "No user memory available as there is no user authenticated."
        )
      );
    }

    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");
    const { agentConfiguration } = runContext;

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
