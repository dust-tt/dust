import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isJITMCPServerView } from "@app/lib/actions/mcp_internal_actions/utils";
import { getToolNamePrefix } from "@app/lib/actions/tool_name_utils";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { TOOLSETS_TOOLS_METADATA } from "@app/lib/api/actions/servers/toolsets/metadata";
import apiConfig from "@app/lib/api/config";
import { getApiKeyNameHeader, prodAPICredentialsForOwner } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { getHeaderFromUserEmail } from "@app/types/user";
import { DustAPI, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";

const handlers: ToolHandlers<typeof TOOLSETS_TOOLS_METADATA> = {
  list: async (_, { auth, runContext }) => {
    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

    const mcpServerViewIdsFromAgentConfiguration =
      runContext.agentConfiguration.actions
        .filter(isServerSideMCPServerConfiguration)
        .map((action) => action.mcpServerViewId);

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

  enable: async ({ toolsetId }, { auth, runContext }) => {
    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

    const conversationId = runContext.conversation.sId;

    if (!auth.user()) {
      return new Err(new MCPError("User not found", { tracked: false }));
    }

    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      toolsetId
    );

    if (!conversation || !mcpServerView || mcpServerView.isRestrictedToSkills) {
      return new Err(
        new MCPError(`Failed to enable toolset`, {
          tracked: false,
        })
      );
    }

    const res = await ConversationResource.upsertMCPServerViews(auth, {
      conversation,
      mcpServerViews: [mcpServerView],
      enabled: true,
      source: "agent_enabled",
      agentConfigurationId: runContext.agentConfiguration.sId,
    });

    if (res.isErr()) {
      return new Err(
        new MCPError(`Failed to enable toolset`, {
          tracked: false,
        })
      );
    }

    const prefixHint = ` Their names share the \`${getToolNamePrefix(
      mcpServerView.name ?? mcpServerView.getServerDisplayMetadata().name
    )}${TOOL_NAME_SEPARATOR}\` prefix.`;

    // The newly enabled tools are not necessarily surfaced directly in the model's context (can
    // be deferred behind tool search), so nudge it to look them up instead of guessing which
    // tools exist.
    return new Ok([
      {
        type: "text" as const,
        text:
          `Successfully enabled toolset ${toolsetId}. Its tools are now available.${prefixHint} ` +
          "Do not assume which tools exist; look them up before calling them.",
      },
    ]);
  },
};

export const TOOLS = buildTools(TOOLSETS_TOOLS_METADATA, handlers);
