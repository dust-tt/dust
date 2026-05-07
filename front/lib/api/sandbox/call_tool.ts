import { FALLBACK_MCP_TOOL_STAKE_LEVEL } from "@app/lib/actions/constants";
import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { makeServerSideMCPToolConfigurations } from "@app/lib/actions/mcp_actions";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import { isSandboxChildResumeState } from "@app/lib/actions/types";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { DEFAULT_MCP_TOOL_RETRY_POLICY } from "@app/lib/api/mcp";
import {
  type SandboxExecTokenPayload,
  verifySandboxExecToken,
} from "@app/lib/api/sandbox/access_tokens";
import { type Authenticator, isSandboxTokenPrefix } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import isEqual from "lodash/isEqual";

export async function extractSandboxClaims(
  token: string | undefined
): Promise<SandboxExecTokenPayload | null> {
  if (!token || !isSandboxTokenPrefix(token)) {
    return null;
  }
  return verifySandboxExecToken(token);
}

/**
 * Builds the run context the sandbox needs to invoke a tool, plus the full
 * (non-stripped) `MCPToolConfigurationType` needed to create the audit row.
 *
 * The parent bash AgentMCPAction is passed in (resolved upstream from the
 * URL + JWT) — its stepContext is reused so the child shares the bash's
 * citations budget, retrieval budget, etc.
 */
export async function buildSandboxCallContext(
  auth: Authenticator,
  claims: SandboxExecTokenPayload,
  {
    parent,
    toolName,
    view,
  }: {
    parent: AgentMCPActionResource;
    toolName: string;
    view: MCPServerViewResource;
  }
): Promise<
  | {
      runContext: AgentLoopRunContextType;
      fullToolConfiguration: MCPToolConfigurationType;
    }
  | undefined
> {
  const mcpServerViewId = view.sId;
  const [agentConfiguration, conversationResult] = await Promise.all([
    getAgentConfiguration(auth, {
      agentId: claims.aId,
      variant: "full",
    }),
    getConversation(auth, claims.cId),
  ]);

  if (!agentConfiguration || conversationResult.isErr()) {
    return undefined;
  }

  const conversation = conversationResult.value;

  const agentMessage = conversation.content
    .flat()
    .find(
      (m): m is AgentMessageType =>
        m.type === "agent_message" && m.sId === claims.mId
    );

  if (!agentMessage) {
    return undefined;
  }

  // Find the matching server-side action config for this server view. Search
  // agent-configured actions first, then fall back to JIT servers (tools added
  // via the conversation input bar).
  let serverSideConfig = agentConfiguration.actions
    .filter(isServerSideMCPServerConfiguration)
    .find((a) => a.mcpServerViewId === mcpServerViewId);

  if (!serverSideConfig) {
    const { servers: jitServers } = await getJITServers(auth, {
      agentConfiguration,
      conversation,
      attachments: [],
    });
    serverSideConfig = jitServers.find(
      (s) => s.mcpServerViewId === mcpServerViewId
    );
  }

  if (!serverSideConfig) {
    return undefined;
  }

  const actualPermission =
    view.getToolPermission(toolName) ?? FALLBACK_MCP_TOOL_STAKE_LEVEL;

  const [fullToolConfiguration] = makeServerSideMCPToolConfigurations(
    serverSideConfig,
    [
      {
        name: toolName,
        description: "", // Not used — stripped before passing to runtime.
        availability: "manual",
        stakeLevel: actualPermission,
        toolServerId: view.mcpServerId,
        retryPolicy: DEFAULT_MCP_TOOL_RETRY_POLICY,
      },
    ]
  );

  if (!fullToolConfiguration) {
    return undefined;
  }

  // Strip inputSchema and description so the runtime object matches
  // LightServerSideMCPToolConfigurationType — the isLight type guard checks
  // !("inputSchema" in arg), so keeping these fields would break downstream
  // guards (e.g. isLightServerSideMCPToolConfiguration).
  const {
    inputSchema: _inputSchema,
    description: _description,
    ...toolConfiguration
  } = fullToolConfiguration;

  return {
    runContext: {
      agentConfiguration,
      agentMessage,
      conversation,
      stepContext: parent.stepContext,
      toolConfiguration,
    },
    fullToolConfiguration,
  };
}

/**
 * Looks up an existing sandbox-child action that matches the parent + tool +
 * inputs. Used by the initial-invoke endpoint to make Rust-client retries (and
 * post-pause re-runs of the parent bash) idempotent — duplicate POSTs return
 * the existing child id without creating a new row or re-emitting an approval
 * event.
 */
export async function findExistingSandboxChild(
  auth: Authenticator,
  {
    parent,
    toolName,
    augmentedInputs,
  }: {
    parent: AgentMCPActionResource;
    toolName: string;
    augmentedInputs: Record<string, unknown>;
  }
): Promise<AgentMCPActionResource | null> {
  const siblings = await AgentMCPActionResource.listByAgentMessageIds(auth, [
    parent.agentMessageId,
  ]);

  const match = siblings.find((s) => {
    const rs = s.stepContext.resumeState;
    if (!isSandboxChildResumeState(rs) || rs.parentActionId !== parent.sId) {
      return false;
    }
    if (s.toolConfiguration.originalName !== toolName) {
      return false;
    }
    return isEqual(s.augmentedInputs, augmentedInputs);
  });

  return match ?? null;
}
