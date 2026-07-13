import { tryListMCPTools } from "@app/lib/actions/mcp_actions";
import { isJITMCPServerView } from "@app/lib/actions/mcp_internal_actions/utils";
import { isServerSideMCPServerConfigurationWithName } from "@app/lib/actions/types/guards";
import { createClientSideMCPServerConfigurations } from "@app/lib/api/actions/mcp_client_side";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { buildToolsetsContext } from "@app/lib/api/assistant/global_agents/configurations/dust/dust";
import {
  globalAgentInjectsToolsets,
  globalAgentInjectsUserContext,
  globalAgentInjectsWorkspaceContext,
} from "@app/lib/api/assistant/global_agents/prompt_context";
import {
  buildUserContext,
  buildWorkspaceContext,
} from "@app/lib/api/assistant/global_agents/sidekick_context";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { getSkillServers } from "@app/lib/api/assistant/skill_actions";
import { renderEquippedSkillsUserMessage } from "@app/lib/api/assistant/skills_rendering";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { constructProjectContext } from "@app/lib/resources/skill/code_defined/global/projects";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageOrigin,
} from "@app/types/assistant/conversation";
import {
  isComputerFeatureEnabled,
  type WhitelistableFeature,
} from "@app/types/shared/feature_flags";
import { removeNulls } from "@app/types/shared/utils/general";
import { startActiveObservation } from "@langfuse/tracing";
import {
  buildBaseSpecifications,
  buildToolDefinitionsForTokenCount,
} from "./model_rendering_tools";

export {
  buildBaseSpecifications,
  buildSpecificationsWithReplayPlaceholders,
  buildToolDefinitionsForTokenCount,
  getMissingActionCatcherFunctionCallIds,
} from "./model_rendering_tools";

const ASK_USER_QUESTION_BLOCKED_ORIGINS: readonly UserMessageOrigin[] = [
  "api",
  "cli",
  "cli_programmatic",
  "email",
  "excel",
  "gsheet",
  "make",
  "n8n",
  "powerpoint",
  "raycast",
  "slack_workflow",
  "teams",
  "transcript",
  "zapier",
  "zendesk",
  "onboarding_conversation",
  "reinforced_skill_notification",
  "reinforcement",
  "branch_anchor",
];

export async function prepareModelRender(
  auth: Authenticator,
  {
    runAgentData,
    featureFlags,
    conversation,
    agentMessage,
  }: {
    runAgentData: AgentLoopExecutionData;
    featureFlags: WhitelistableFeature[];
    conversation: ConversationType;
    agentMessage: AgentMessageType;
  }
) {
  const { agentConfiguration, userMessage, model } = runAgentData;

  const {
    enabledSkills,
    systemSkills,
    equippedSkills,
    serverToolsAndInstructions: mcpActions,
  } = await startActiveObservation("resolve-tools", async () => {
    const attachments = await listAttachments(auth, { conversation });
    const jitServers = await getJITServers(auth, {
      agentConfiguration,
      conversation,
      attachments,
    });

    const clientSideMCPActionConfigurations =
      await createClientSideMCPServerConfigurations(auth, [
        ...(userMessage.context.clientSideMCPServerIds ?? []),
      ]);

    const { enabledSkills, systemSkills, equippedSkills } =
      await SkillResource.listForAgentLoop(auth, runAgentData);

    const { skillServers, systemSkillServers } = await getSkillServers(auth, {
      agentConfiguration,
      enabledSkills,
      systemSkills,
    });

    const serverToolsAndInstructions = await startActiveObservation(
      "list-mcp-tools",
      () =>
        tryListMCPTools(
          auth,
          {
            agentConfiguration,
            conversation,
            agentMessage,
            clientSideActionConfigurations: clientSideMCPActionConfigurations,
          },
          { jitServers, skillServers, systemSkillServers }
        )
    );

    return {
      enabledSkills,
      equippedSkills,
      systemSkills,
      serverToolsAndInstructions,
    };
  });

  const supportsInteractiveQuestions =
    !ASK_USER_QUESTION_BLOCKED_ORIGINS.includes(userMessage.context.origin) &&
    conversation.depth === 0;
  const filteredMcpActions = supportsInteractiveQuestions
    ? mcpActions
    : mcpActions.filter((server) => server.serverName !== "ask_user_question");
  const availableActions = filteredMcpActions.flatMap((server) => server.tools);

  let fallbackPrompt = "You are a conversational agent";
  if (agentConfiguration.actions.length || availableActions.length > 0) {
    fallbackPrompt += " with access to tool use.";
  } else {
    fallbackPrompt += ".";
  }

  let toolsetsContext: string | undefined;
  const hasToolsetsAction = agentConfiguration.actions.some((action) =>
    isServerSideMCPServerConfigurationWithName(action, "toolsets")
  );
  if (globalAgentInjectsToolsets(agentConfiguration.sId) && hasToolsetsAction) {
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    const allToolsets =
      await MCPServerViewResource.listBySpaceEnsuringAutoViews(
        auth,
        globalSpace
      );
    const filteredToolsets = allToolsets.filter((toolset) => {
      const mcpServerView = toolset.toJSON();
      return (
        isJITMCPServerView(mcpServerView) &&
        mcpServerView.server.availability !== "auto_hidden_builder"
      );
    });
    toolsetsContext = buildToolsetsContext(filteredToolsets);
  }

  let userContext: string | undefined;
  if (globalAgentInjectsUserContext(agentConfiguration.sId) && auth.user()) {
    userContext = (await buildUserContext(auth)) ?? undefined;
  }

  let workspaceContext: string | undefined;
  if (globalAgentInjectsWorkspaceContext(agentConfiguration.sId)) {
    workspaceContext = await buildWorkspaceContext(auth);
  }

  const projectContext = await constructProjectContext(auth, { conversation });
  const isNewFileExplorer = conversation.metadata?.useFileSystem === true;
  const hasSandboxTools = isComputerFeatureEnabled(featureFlags);
  const disableFormattingPrompt = featureFlags.includes(
    "disable_formatting_prompt"
  );

  const prompt = constructPromptMultiActions(auth, {
    userMessage,
    agentConfiguration,
    fallbackPrompt,
    model,
    hasAvailableActions: availableActions.length > 0,
    conversation,
    serverToolsAndInstructions: filteredMcpActions,
    systemSkills,
    toolsetsContext,
    userContext,
    workspaceContext,
    projectContext,
    isNewFileExplorer,
    hasSandboxTools,
    disableFormattingPrompt,
  });
  const leadingMessages = removeNulls([
    renderEquippedSkillsUserMessage(equippedSkills),
  ]);

  const toolSearchEnabled =
    featureFlags.includes("anthropic_tool_search") &&
    !!model.supportsToolSearch;
  const baseSpecifications = buildBaseSpecifications(
    availableActions,
    agentConfiguration
  );
  const tools = buildToolDefinitionsForTokenCount(
    baseSpecifications,
    toolSearchEnabled
  );

  return {
    availableActions,
    baseSpecifications,
    enabledSkills,
    equippedSkillCount: equippedSkills.length,
    filteredMcpActions,
    leadingMessages,
    prompt,
    promptText: systemPromptToText(prompt),
    systemSkillCount: systemSkills.length,
    tools,
    toolSearchEnabled,
  };
}
