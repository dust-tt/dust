import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { TOOLSETS_TOOLS_METADATA } from "@app/lib/api/actions/servers/toolsets/metadata";
import apiConfig from "@app/lib/api/config";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { getHeaderFromGroupIds } from "@app/types/groups";
import { Err, Ok } from "@app/types/shared/result";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { DustAPI, INTERNAL_MIME_TYPES } from "@dust-tt/client";

const handlers: ToolHandlers<typeof TOOLSETS_TOOLS_METADATA> = {
  list: async (_, { auth, agentLoopContext }) => {
    const mcpServerViewIdsFromAgentConfiguration =
      agentLoopContext?.runContext?.agentConfiguration.actions
        .filter(isServerSideMCPServerConfiguration)
        .map((action) => action.mcpServerViewId) ?? [];

    const owner = auth.getNonNullableWorkspace();
    const requestedGroupIds = auth.groupIds();
    const prodCredentials = await prodAPICredentialsForOwner(owner, {
      useLocalInDev: true,
    });
    const config = apiConfig.getDustAPIConfig();
    const api = new DustAPI(
      config,
      {
        ...prodCredentials,
        extraHeaders: {
          ...getHeaderFromGroupIds(requestedGroupIds),
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
      .filter(
        (mcpServerView) => getMCPServerRequirements(mcpServerView).noRequirement
      )
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

    const requestedGroupIds = auth.groupIds();
    const prodCredentials = await prodAPICredentialsForOwner(owner, {
      useLocalInDev: true,
    });
    const config = apiConfig.getDustAPIConfig();

    const api = new DustAPI(
      config,
      {
        ...prodCredentials,
        extraHeaders: {
          ...getHeaderFromGroupIds(requestedGroupIds),
          "x-api-user-email": user.email,
        },
      },
      logger,
      config.nodeEnv === "development" ? "http://localhost:3000" : null
    );

    const res = await api.postConversationTools({
      conversationId,
      action: "add",
      mcpServerViewId: toolsetId,
    });

    if (res.isErr() || !res.value.success) {
      return new Err(
        new MCPError(`Failed to enable toolset`, {
          tracked: false,
        })
      );
    }

    return new Ok([
      {
        type: "text" as const,
        text: `Successfully enabled toolset ${toolsetId}`,
      },
    ]);
  },
};

export const TOOLS = buildTools(TOOLSETS_TOOLS_METADATA, handlers);
