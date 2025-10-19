import fs from "fs";
import path from "path";
import { promisify } from "util";

import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import { globalAgentGuidelines } from "@app/lib/api/assistant/global_agents/guidelines";
import {
  _getAgentRouterToolsConfiguration,
  _getDefaultWebActionsForGlobalAgent,
  _getInteractiveContentToolConfiguration,
} from "@app/lib/api/assistant/global_agents/tools";
import { dummyModelConfiguration } from "@app/lib/api/assistant/global_agents/utils";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  AgentModelConfigurationType,
} from "@app/types/assistant/agent";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import {
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  GLOBAL_AGENTS_SID,
} from "@app/types/assistant/assistant";

const readFileAsync = promisify(fs.readFile);

export class HelperAssistantPrompt {
  private static instance: HelperAssistantPrompt;
  private staticPrompt: string | null;

  constructor(staticPrompt: string | null) {
    this.staticPrompt = staticPrompt;
  }

  public static async getInstance(): Promise<HelperAssistantPrompt> {
    if (!HelperAssistantPrompt.instance) {
      let staticPrompt: string | null = null;
      try {
        const filePath = path.join(
          process.cwd(),
          "prompt/global_agent_helper_prompt.md"
        );
        staticPrompt = await readFileAsync(filePath, "utf-8");
      } catch (err) {
        logger.error("Error reading prompt file for @help agent:", err);
      }
      HelperAssistantPrompt.instance = new HelperAssistantPrompt(staticPrompt);
    }
    return HelperAssistantPrompt.instance;
  }

  public getStaticPrompt(): string | null {
    return this.staticPrompt;
  }
}

export function _getHelperGlobalAgent({
  auth,
  helperPromptInstance,
  agentRouterMCPServerView,
  webSearchBrowseMCPServerView,
  searchMCPServerView,
  interactiveContentMCPServerView,
}: {
  auth: Authenticator;
  helperPromptInstance: HelperAssistantPrompt;
  agentRouterMCPServerView: MCPServerViewResource | null;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
  searchMCPServerView: MCPServerViewResource | null;
  interactiveContentMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType {
  let prompt = "";

  const user = auth.user();
  if (user) {
    const role = auth.role();
    prompt = `The user you're interacting with is granted with the role ${role}. Their name is ${user.fullName}. `;
  }

  const staticPrompt = helperPromptInstance.getStaticPrompt();

  if (staticPrompt) {
    prompt = prompt + staticPrompt;
  }
  const owner = auth.getNonNullableWorkspace();

  const modelConfiguration = auth.isUpgraded()
    ? getLargeWhitelistedModel(owner)
    : getSmallWhitelistedModel(owner);

  const model: AgentModelConfigurationType = modelConfiguration
    ? {
        providerId: modelConfiguration?.providerId,
        modelId: modelConfiguration?.modelId,
        temperature: 0.2,
        reasoningEffort: modelConfiguration?.defaultReasoningEffort,
      }
    : dummyModelConfiguration;
  const status = modelConfiguration ? "active" : "disabled_by_admin";

  const actions: MCPServerConfigurationType[] = [];

  if (searchMCPServerView) {
    actions.push({
      id: -1,
      sId: GLOBAL_AGENTS_SID.HELPER + "-search-action",
      type: "mcp_server_configuration",
      name: "search_dust_docs",
      description: "The documentation of the Dust platform.",
      mcpServerViewId: searchMCPServerView.sId,
      internalMCPServerId: searchMCPServerView.internalMCPServerId,
      dataSources: [
        {
          dataSourceViewId: config.getDustAppsHelperDatasourceViewId(),
          workspaceId: config.getDustAppsWorkspaceId(),
          filter: { parents: null, tags: null },
        },
      ],
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
    });
  }

  actions.push(
    ..._getDefaultWebActionsForGlobalAgent({
      agentId: GLOBAL_AGENTS_SID.HELPER,
      webSearchBrowseMCPServerView,
    })
  );

  actions.push(
    ..._getAgentRouterToolsConfiguration(
      GLOBAL_AGENTS_SID.HELPER,
      agentRouterMCPServerView,
      autoInternalMCPServerNameToSId({
        name: "agent_router",
        workspaceId: owner.id,
      })
    )
  );

  const sId = GLOBAL_AGENTS_SID.HELPER;
  const metadata = getGlobalAgentMetadata(sId);

  actions.push(
    ..._getInteractiveContentToolConfiguration({
      agentId: sId,
      interactiveContentMCPServerView,
    })
  );

  return {
    id: -1,
    sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.name,
    description: metadata.description,
    instructions: prompt + globalAgentGuidelines,
    pictureUrl: metadata.pictureUrl,
    status: status,
    userFavorite: false,
    scope: "global",
    model: model,
    actions,
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}
