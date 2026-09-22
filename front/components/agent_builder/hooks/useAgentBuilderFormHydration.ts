import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AgentBuilderFormData,
  AgentBuilderSkillsType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import type { AgentBuilderMCPConfigurationWithId } from "@app/components/agent_builder/types";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type {
  AdditionalConfigurationInBuilderType,
  BuilderAction,
} from "@app/components/shared/tools_picker/types";
import type { AdditionalConfigurationType } from "@app/lib/models/agent/actions/mcp";
import { useAgentConfigurationActions } from "@app/lib/swr/actions";
import { useEditors } from "@app/lib/swr/agent_editors";
import { useAgentTriggers } from "@app/lib/swr/agent_triggers";
import { useSlackChannelsLinkedWithAgent } from "@app/lib/swr/assistants";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useAgentConfigurationSkills } from "@app/lib/swr/skills";
import { emptyArray } from "@app/lib/swr/swr";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { UserType } from "@app/types/user";
import set from "lodash/set";
import { useCallback, useMemo } from "react";

type AgentSettings = AgentBuilderFormData["agentSettings"];

function processAdditionalConfigurationFromStorage(
  config: AdditionalConfigurationType
): AdditionalConfigurationInBuilderType {
  const additionalConfig: AdditionalConfigurationInBuilderType = {};

  for (const [key, value] of Object.entries(config)) {
    set(additionalConfig, key, value);
  }

  return additionalConfig;
}

function processActionsFromStorage(
  actions: AgentBuilderMCPConfigurationWithId[]
): BuilderAction[] {
  return actions.map((action) => ({
    ...action,
    configuration: {
      ...action.configuration,
      additionalConfiguration: processAdditionalConfigurationFromStorage(
        action.configuration.additionalConfiguration
      ),
    },
  }));
}

function useSlackSettings(
  agentConfiguration: AgentConfigurationType | undefined
): Pick<AgentSettings, "slackProvider" | "slackChannels"> {
  const { owner } = useAgentBuilderContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  const { hasPermission } = useWorkspacePermissions();
  const canPublishAgent = hasPermission("publish", "agent");

  const { slackChannels: linkedChannels } = useSlackChannelsLinkedWithAgent({
    workspaceId: owner.sId,
    disabled: !agentConfiguration || !canPublishAgent,
  });

  const slackProvider = useMemo(() => {
    if (!canPublishAgent) {
      return null;
    }

    const hasSlackBot = supportedDataSourceViews.some(
      (dsv) => dsv.dataSource.connectorProvider === "slack_bot"
    );
    if (hasSlackBot) {
      return "slack_bot";
    }

    const hasSlack = supportedDataSourceViews.some(
      (dsv) => dsv.dataSource.connectorProvider === "slack"
    );
    return hasSlack ? "slack" : null;
  }, [supportedDataSourceViews, canPublishAgent]);

  const slackChannels = useMemo(() => {
    if (!agentConfiguration) {
      return [];
    }

    return linkedChannels
      .filter(
        (channel) => channel.agentConfigurationId === agentConfiguration.sId
      )
      .map((channel) => ({
        slackChannelId: channel.slackChannelId,
        slackChannelName: channel.slackChannelName,
        autoRespondWithoutMention: channel.autoRespondWithoutMention,
        autoRespondWithoutMentionSkipThreadReplies:
          channel.autoRespondWithoutMentionSkipThreadReplies,
        isPrivate: channel.isPrivate,
      }));
  }, [agentConfiguration, linkedChannels]);

  return { slackProvider, slackChannels };
}

// Additional spaces = total - actions - skills - global space
function useAdditionalSpaces(
  agentConfiguration: AgentConfigurationType | undefined,
  actions: BuilderAction[],
  skillSpaceIds: string[]
): string[] {
  const { mcpServerViews } = useMCPServerViewsContext();
  const { spaces } = useSpacesContext();

  return useMemo(() => {
    if (!agentConfiguration?.requestedSpaceIds) {
      return [];
    }

    const actionSpaceIds = new Set(
      Object.keys(getSpaceIdToActionsMap(actions, mcpServerViews))
    );
    const usedBySkills = new Set(skillSpaceIds);
    const globalSpaceId = spaces.find((s) => s.kind === "global")?.sId;

    // The Set also de-duplicates the requested ids before they reach the form.
    return [...new Set(agentConfiguration.requestedSpaceIds)].filter(
      (spaceId) =>
        !actionSpaceIds.has(spaceId) &&
        !usedBySkills.has(spaceId) &&
        spaceId !== globalSpaceId
    );
  }, [agentConfiguration, actions, mcpServerViews, skillSpaceIds, spaces]);
}

function resolveEditors(
  editors: AgentSettings["editors"],
  agentConfiguration: AgentConfigurationType | undefined,
  isDuplicate: boolean,
  user: UserType
): AgentSettings["editors"] {
  if (isDuplicate) {
    return [user];
  }

  return agentConfiguration || editors.length > 0 ? editors : [user];
}

// The form fields the backend transforms leave empty on purpose, because they are only available
// from client-side fetches.
type HydratedAgentFormValues = Pick<
  AgentBuilderFormData,
  | "actions"
  | "skills"
  | "additionalSpaces"
  | "triggersToCreate"
  | "triggersToUpdate"
  | "triggersToDelete"
> &
  Pick<AgentSettings, "slackProvider" | "editors" | "slackChannels">;

interface UseAgentBuilderFormHydrationInput {
  agentConfiguration?: AgentConfigurationType;
  duplicateAgentId?: string | null;
}

export function useAgentBuilderFormHydration({
  agentConfiguration,
  duplicateAgentId,
}: UseAgentBuilderFormHydrationInput) {
  const { owner, user } = useAgentBuilderContext();

  const isDuplicate = !!duplicateAgentId;
  const sourceAgentId = duplicateAgentId ?? agentConfiguration?.sId ?? null;
  const agentId = agentConfiguration?.sId ?? null;

  const {
    actions,
    isActionsError,
    isActionsLoading,
    isActionsValidating,
    mutateActions,
  } = useAgentConfigurationActions(owner.sId, sourceAgentId);

  const {
    triggers,
    isTriggersError,
    isTriggersLoading,
    isTriggersValidating,
    mutateTriggers,
  } = useAgentTriggers({
    workspaceId: owner.sId,
    agentConfigurationId: agentId,
  });

  const {
    skills,
    isSkillsError,
    isSkillsLoading,
    isSkillsValidating,
    mutateSkills,
  } = useAgentConfigurationSkills({
    owner,
    agentConfigurationId: sourceAgentId ?? "",
    disabled: !sourceAgentId,
  });

  const {
    editors,
    isEditorsError,
    isEditorsLoading,
    isEditorsValidating,
    mutateEditors,
  } = useEditors({
    owner,
    agentConfigurationId: agentId,
    disabled: !agentConfiguration || isDuplicate,
  });

  const { slackProvider, slackChannels } = useSlackSettings(agentConfiguration);

  const processedActions = useMemo(
    () => processActionsFromStorage(actions ?? emptyArray()),
    [actions]
  );

  const processedSkills: AgentBuilderSkillsType[] = useMemo(
    () =>
      skills.map((skill) => ({
        sId: skill.sId,
        name: skill.name,
        description: skill.userFacingDescription,
        icon: skill.icon,
        availability: skill.availability,
        canWrite: skill.canWrite,
      })),
    [skills]
  );

  const skillSpaceIds = useMemo(
    () => skills.flatMap((skill) => skill.requestedSpaceIds),
    [skills]
  );

  const additionalSpaces = useAdditionalSpaces(
    agentConfiguration,
    processedActions,
    skillSpaceIds
  );

  const hydratedValues: HydratedAgentFormValues = useMemo(() => {
    const userOwnedTriggers = triggers.filter(
      (trigger) => trigger.editor === user.id
    );

    return {
      actions: processedActions,
      skills: processedSkills,
      additionalSpaces,
      triggersToCreate: isDuplicate ? userOwnedTriggers : [],
      triggersToUpdate: isDuplicate ? [] : userOwnedTriggers,
      triggersToDelete: [],
      slackProvider,
      editors: resolveEditors(editors, agentConfiguration, isDuplicate, user),
      slackChannels,
    };
  }, [
    triggers,
    user,
    processedActions,
    processedSkills,
    additionalSpaces,
    isDuplicate,
    slackProvider,
    agentConfiguration,
    editors,
    slackChannels,
  ]);

  const refresh = useCallback(async () => {
    await Promise.all([
      mutateTriggers(),
      mutateActions(),
      mutateSkills(),
      mutateEditors(),
    ]);
  }, [mutateTriggers, mutateActions, mutateSkills, mutateEditors]);

  return {
    hydratedValues,
    editors,
    isEditorsError,
    isEditorsLoading,
    isActionsLoading,
    isSkillsLoading,
    isTriggersLoading,
    hasLoadError:
      isActionsError || isSkillsError || !!isTriggersError || isEditorsError,
    isValidating:
      isActionsValidating ||
      isSkillsValidating ||
      isTriggersValidating ||
      isEditorsValidating,
    isLoading:
      isActionsLoading ||
      isSkillsLoading ||
      isTriggersLoading ||
      isEditorsLoading,
    refresh,
    mutateEditors,
  };
}
