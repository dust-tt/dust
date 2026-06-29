import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isJITMCPServerView } from "@app/lib/actions/mcp_internal_actions/utils";
import { tryGetPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { TOOLSETS_TOOLS_METADATA } from "@app/lib/api/actions/servers/toolsets/metadata";
import apiConfig from "@app/lib/api/config";
import { getApiKeyNameHeader, prodAPICredentialsForOwner } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { getHeaderFromUserEmail } from "@app/types/user";
import { DustAPI, INTERNAL_MIME_TYPES } from "@dust-tt/client";

const handlers: ToolHandlers<typeof TOOLSETS_TOOLS_METADATA> = {
  list: async (_, { auth, agentLoopContext }) => {
    const mcpServerViewIdsFromAgentConfiguration =
      agentLoopContext?.runContext?.agentConfiguration.actions
        .filter(isServerSideMCPServerConfiguration)
        .map((action) => action.mcpServerViewId) ?? [];

    const owner = auth.getNonNullableWorkspace();
    const user = auth.user();
    const prodCredentials = await prodAPICredentialsForOwner(owner, {
      useLocalInDev: true,
    });
    const config = apiConfig.getDustAPIConfig();
    const api = new DustAPI(
      config,
      {
        ...prodCredentials,
        extraHeaders: {
          ...getHeaderFromUserEmail(user?.email),
          ...getApiKeyNameHeader(auth),
        },
      },
      logger,
      config.nodeEnv === "development" ? "http://localhost:3000" : null
    );
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    const r = await api.getMCPServerViews(globalSpace.sId, true);
    if (r.isErr()) {
      throw new Error(r.error.message);
    }

    const mcpServerViews = r.value
      .filter(
        (mcpServerView) =>
          !mcpServerViewIdsFromAgentConfiguration.includes(mcpServerView.sId)
      )
      .filter(isJITMCPServerView)
      .filter(
        (mcpServerView) =>
          mcpServerView.server.availability !== "auto_hidden_builder"
      );

    return new Ok(
      mcpServerViews.map((mcpServerView) => ({
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.TOOLSET_LIST_RESULT,
          uri: "",
          id: mcpServerView.sId,
          text: getMcpServerViewDisplayName(mcpServerView),
          description: getMcpServerViewDescription(mcpServerView),
        },
      }))
    );
  },

  enable: async ({ toolsetId }, { auth, agentLoopContext }) => {
    const conversationId = agentLoopContext?.runContext?.conversation.sId;
    if (!conversationId) {
      return new Err(
        new MCPError("No active conversation context", { tracked: false })
      );
    }

    const owner = auth.getNonNullableWorkspace();
    const user = auth.user();
    if (!user) {
      return new Err(new MCPError("User not found", { tracked: false }));
    }

    const prodCredentials = await prodAPICredentialsForOwner(owner, {
      useLocalInDev: true,
    });
    const config = apiConfig.getDustAPIConfig();

    const api = new DustAPI(
      config,
      {
        ...prodCredentials,
        extraHeaders: {
          ...getHeaderFromUserEmail(user.email),
          ...getApiKeyNameHeader(auth),
        },
      },
      logger,
      config.nodeEnv === "development" ? "http://localhost:3000" : null
    );

    const agentConfigurationId =
      agentLoopContext?.runContext?.agentConfiguration.sId;

    const res = await api.postConversationTools({
      conversationId,
      action: "add",
      mcpServerViewId: toolsetId,
      agentConfigurationId,
    });

    if (res.isErr() || !res.value.success) {
      return new Err(
        new MCPError(`Failed to enable toolset`, {
          tracked: false,
        })
      );
    }

    // List the tools that just became available so the model can clearly tell which functions
    // it can now call (the bare success message made this ambiguous).
    const enabledViewResource = await MCPServerViewResource.fetchById(
      auth,
      toolsetId
    );
    if (!enabledViewResource) {
      return new Ok([
        {
          type: "text" as const,
          text: `Successfully enabled toolset ${toolsetId}.`,
        },
      ]);
    }
    const enabledView = enabledViewResource.toJSON();

    const toolsetName = getMcpServerViewDisplayName(enabledView);

    // If there is no toolsMetadata (= undefined or empty array), every tool is enabled.
    const disabledToolNames =
      enabledView.toolsMetadata
        ?.filter((tool) => tool.enabled === false)
        .map((tool) => tool.toolName) ?? [];
    const enabledTools = enabledView.server.tools.filter(
      (tool) => !disabledToolNames.includes(tool.name)
    );

    // Prefix the tool names the same way the agent loop does, so the names listed here match the
    // ones the model will actually call.
    const serverName = enabledView.name ?? enabledView.server.name;
    const toolNames = enabledTools.flatMap((tool) => {
      const prefixedNameRes = tryGetPrefixedToolName(serverName, tool.name);
      return prefixedNameRes.isOk() ? [prefixedNameRes.value] : [];
    });

    const text =
      toolNames.length > 0
        ? `Successfully enabled toolset "${toolsetName}". The following tools are now available:\n` +
        `${toolNames.map((name) => `- \`${name}\``).join("\n")}`
        : `Successfully enabled toolset "${toolsetName}", but it does not expose any tool.`;

    return new Ok([
      {
        type: "text" as const,
        text,
      },
    ]);
  },
};

export const TOOLS = buildTools(TOOLSETS_TOOLS_METADATA, handlers);
