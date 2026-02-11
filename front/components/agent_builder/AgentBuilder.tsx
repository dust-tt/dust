import { zodResolver } from "@hookform/resolvers/zod";
import set from "lodash/set";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AgentBuilderFormData,
  AgentBuilderSkillsType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  AgentBuilderFormContext,
  agentBuilderFormSchema,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderLayout } from "@app/components/agent_builder/AgentBuilderLayout";
import { AgentBuilderLeftPanel } from "@app/components/agent_builder/AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "@app/components/agent_builder/AgentBuilderRightPanel";
import { AgentCreatedDialog } from "@app/components/agent_builder/AgentCreatedDialog";
import {
  CopilotSuggestionsProvider,
  useCopilotSuggestions,
} from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import { useCopilotMCPServer } from "@app/components/agent_builder/copilot/useMCPServer";
import { CopilotPanelProvider } from "@app/components/agent_builder/CopilotPanelContext";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import {
  PersonalConnectionRequiredDialog,
  useAwaitableDialog,
} from "@app/components/agent_builder/PersonalConnectionRequiredDialog";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import {
  getDefaultAgentFormData,
  transformAgentConfigurationToFormData,
  transformDuplicateAgentToFormData,
  transformTemplateToFormData,
} from "@app/components/agent_builder/transformAgentConfiguration";
import type { AgentBuilderMCPConfigurationWithId } from "@app/components/agent_builder/types";
import { ConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConfirmContext } from "@app/components/Confirm";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type {
  AdditionalConfigurationInBuilderType,
  BuilderAction,
} from "@app/components/shared/tools_picker/types";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useNavigationLock } from "@app/hooks/useNavigationLock";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { AdditionalConfigurationType } from "@app/lib/models/agent/actions/mcp";
import { useAppRouter } from "@app/lib/platform";
import { useAgentConfigurationActions } from "@app/lib/swr/actions";
import { useEditors } from "@app/lib/swr/agent_editors";
import { useAgentTriggers } from "@app/lib/swr/agent_triggers";
import { useSlackChannelsLinkedWithAgent } from "@app/lib/swr/assistants";
import { useAgentConfigurationSkills } from "@app/lib/swr/skills";
import { emptyArray } from "@app/lib/swr/swr";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { removeParamFromRouter } from "@app/lib/utils/router_util";
import datadogLogger from "@app/logger/datadogLogger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import { pluralize } from "@app/types/shared/utils/string_utils";
import { isBuilder } from "@app/types/user";

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

function processAdditionalConfigurationFromStorage(
  config: AdditionalConfigurationType
): AdditionalConfigurationInBuilderType {
  const additionalConfig: AdditionalConfigurationInBuilderType = {};

  for (const [key, value] of Object.entries(config)) {
    set(additionalConfig, key, value);
  }

  return additionalConfig;
}

interface AgentBuilderProps {
  agentConfiguration?: LightAgentConfigurationType;
  duplicateAgentId?: string | null;
  // TODO(copilot 2026-02-10): hack to allow copilot to access draft templates, remove once done iterating on copilot template instructions.
  copilotTemplateId?: string | null;
  conversationId?: string;
}

export default function AgentBuilder({
  agentConfiguration,
  duplicateAgentId,
  copilotTemplateId,
  conversationId,
}: AgentBuilderProps) {
  const { owner, user, assistantTemplate } = useAgentBuilderContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  const { mcpServerViews } = useMCPServerViewsContext();

  const router = useAppRouter();
  const sendNotification = useSendNotification(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatedDialogOpen, setIsCreatedDialogOpen] = useState(false);
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);

  const { actions, isActionsLoading, mutateActions } =
    useAgentConfigurationActions(
      owner.sId,
      duplicateAgentId ?? agentConfiguration?.sId ?? null
    );

  const { triggers, isTriggersLoading, mutateTriggers } = useAgentTriggers({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration?.sId ?? null,
  });

  const agentConfigurationIdForSkills =
    duplicateAgentId ?? agentConfiguration?.sId ?? null;
  const { skills, isSkillsLoading } = useAgentConfigurationSkills({
    owner,
    agentConfigurationId: agentConfigurationIdForSkills ?? "",
    disabled: !agentConfigurationIdForSkills,
  });

  const { editors } = useEditors({
    owner,
    agentConfigurationId: agentConfiguration?.sId ?? null,
  });

  const { slackChannels: slackChannelsLinkedWithAgent } =
    useSlackChannelsLinkedWithAgent({
      workspaceId: owner.sId,
      disabled: !agentConfiguration || !isBuilder(owner),
    });

  const slackProvider = useMemo(() => {
    const slackBotProvider = supportedDataSourceViews.find(
      (dsv) => dsv.dataSource.connectorProvider === "slack_bot"
    );
    if (slackBotProvider) {
      return "slack_bot";
    }

    const slackProvider = supportedDataSourceViews.find(
      (dsv) => dsv.dataSource.connectorProvider === "slack"
    );
    return slackProvider ? "slack" : null;
  }, [supportedDataSourceViews]);

  const processedActions = useMemo(() => {
    return processActionsFromStorage(actions ?? emptyArray());
  }, [actions]);

  const processedSkills: AgentBuilderSkillsType[] = useMemo(() => {
    return skills.map((skill) => ({
      sId: skill.sId,
      name: skill.name,
      description: skill.userFacingDescription,
      icon: skill.icon,
    }));
  }, [skills]);

  const agentSlackChannels = useMemo(() => {
    if (!agentConfiguration || !slackChannelsLinkedWithAgent.length) {
      return [];
    }

    return slackChannelsLinkedWithAgent
      .filter(
        (channel) => channel.agentConfigurationId === agentConfiguration.sId
      )
      .map((channel) => ({
        slackChannelId: channel.slackChannelId,
        slackChannelName: channel.slackChannelName,
        autoRespondWithoutMention: channel.autoRespondWithoutMention,
      }));
  }, [agentConfiguration, slackChannelsLinkedWithAgent]);

  // Additional spaces = total - actions - skills
  const computedAdditionalSpaces = useMemo(() => {
    if (!agentConfiguration || !agentConfiguration.requestedSpaceIds) {
      return [];
    }

    const agentRequestedSpaceIds = new Set(
      agentConfiguration.requestedSpaceIds
    );

    const spaceIdToActions = getSpaceIdToActionsMap(
      processedActions,
      mcpServerViews
    );
    const actionSpaceIds = new Set(Object.keys(spaceIdToActions));

    const skillSpaceIds = new Set(
      skills.flatMap((skill) => skill.requestedSpaceIds)
    );

    return [...agentRequestedSpaceIds].filter(
      (spaceId) => !actionSpaceIds.has(spaceId) && !skillSpaceIds.has(spaceId)
    );
  }, [agentConfiguration, processedActions, mcpServerViews, skills]);

  // This defaultValues should be computed only with data from backend.
  // Any other values we are fetching on client side should be updated inside
  // the useEffect below.
  const defaultValues = useMemo(() => {
    if (duplicateAgentId && agentConfiguration) {
      // Handle agent duplication case
      return transformDuplicateAgentToFormData(agentConfiguration, user);
    }

    if (agentConfiguration) {
      return transformAgentConfigurationToFormData(agentConfiguration);
    }

    if (assistantTemplate) {
      return transformTemplateToFormData(assistantTemplate, user, owner);
    }

    return getDefaultAgentFormData({
      owner,
      user,
    });
  }, [agentConfiguration, duplicateAgentId, assistantTemplate, user, owner]);

  const form = useForm<AgentBuilderFormData>({
    resolver: zodResolver(agentBuilderFormSchema),
    defaultValues,
    resetOptions: {
      keepDirtyValues: true,
      keepErrors: true,
    },
  });

  useEffect(() => {
    const currentValues = form.getValues();

    form.reset({
      ...currentValues,
      actions: processedActions,
      skills: processedSkills,
      additionalSpaces: computedAdditionalSpaces,
      triggersToCreate: duplicateAgentId
        ? triggers.map((trigger) => ({
            ...trigger,
            editor: user.id,
          }))
        : [],
      triggersToUpdate: duplicateAgentId ? [] : triggers,
      triggersToDelete: [],
      agentSettings: {
        ...currentValues.agentSettings,
        slackProvider,
        editors: duplicateAgentId
          ? [user]
          : agentConfiguration || editors.length > 0
            ? editors
            : [user],
        slackChannels: agentSlackChannels,
      },
    });
  }, [
    triggers,
    isTriggersLoading,
    isActionsLoading,
    isSkillsLoading,
    processedActions,
    processedSkills,
    computedAdditionalSpaces,
    form,
    duplicateAgentId,
    user,
    slackProvider,
    editors,
    agentConfiguration,
    agentSlackChannels,
  ]);

  const { showDialog, ...dialogProps } = useAwaitableDialog({
    owner,
    mcpServerViewToCheckIds: removeNulls(
      form.getValues("actions").map((a) => a.configuration.mcpServerViewId)
    ),
    mcpServerViews,
  });

  useEffect(() => {
    const createdParam = router.query.showCreatedDialog;
    const shouldOpenDialog =
      Boolean(agentConfiguration) &&
      isString(createdParam) &&
      (createdParam === "1" || createdParam === "true");

    if (!shouldOpenDialog) {
      return;
    }

    setIsCreatedDialogOpen(true);
    void removeParamFromRouter(router, "showCreatedDialog");
  }, [agentConfiguration, router, router.query.showCreatedDialog]);

  // Create pending agent on mount for NEW agents only
  useEffect(() => {
    // Only create pending agent for new agents (not editing or duplicating)
    if (agentConfiguration || duplicateAgentId || pendingAgentId) {
      return;
    }

    const createPendingAgent = async () => {
      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/assistant/agent_configurations/create-pending`,
          { method: "POST" }
        );
        if (response.ok) {
          const data = await response.json();
          setPendingAgentId(data.sId);
        } else {
          datadogLogger.error(
            { status: response.status },
            "[Agent builder] - Failed to create pending agent"
          );
        }
      } catch (error) {
        datadogLogger.error(
          { error: normalizeError(error) },
          "[Agent builder] - Failed to create pending agent"
        );
      }
    };
    void createPendingAgent();
  }, [agentConfiguration, duplicateAgentId, owner.sId, pendingAgentId]);

  const handleSubmit = async (formData: AgentBuilderFormData) => {
    try {
      setIsSaving(true);
      const confirmed = await showDialog();
      if (!confirmed) {
        setIsSaving(false);
        return;
      }

      // For new agents (not editing or duplicating), use pendingAgentSId as agentConfigurationId
      // For duplicating, pass null to create a new agent
      // For editing, pass the existing agent's sId
      const effectiveAgentConfigurationId = duplicateAgentId
        ? null
        : (agentConfiguration?.sId ?? pendingAgentId ?? null);

      const result = await submitAgentBuilderForm({
        user,
        formData,
        owner,
        isDraft: false,
        agentConfigurationId: effectiveAgentConfigurationId,
        areSlackChannelsChanged: form.getFieldState(
          "agentSettings.slackChannels"
        ).isDirty,
      });

      if (!result.isOk()) {
        sendNotification({
          title: agentConfiguration
            ? "Error updating agent"
            : "Error creating agent",
          description: result.error.message,
          type: "error",
        });
        setIsSaving(false);
        return;
      }

      const createdAgent = result.value;
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const isCreatingNew = duplicateAgentId || !agentConfiguration;

      // Check if there's a warning about Slack channel linking
      if (
        "_warning" in createdAgent &&
        createdAgent._warning === "slack_channel_linking_in_progress"
      ) {
        sendNotification({
          title: isCreatingNew ? "Agent created" : "Agent saved",
          description:
            "The agent has been saved successfully. Some channels are currently being linked, the operation will complete shortly.",
          type: "info",
        });
      } else {
        sendNotification({
          title: isCreatingNew ? "Agent created" : "Agent saved",
          description: isCreatingNew
            ? "Your agent has been successfully created"
            : "Your agent has been successfully saved",
          type: "success",
        });
      }

      // Mutate triggers and actions to refresh from backend
      await Promise.all([mutateTriggers(), mutateActions()]);

      if (isCreatingNew && createdAgent.sId) {
        const newUrl = `/w/${owner.sId}/builder/agents/${createdAgent.sId}?showCreatedDialog=1`;
        await router.replace(newUrl, undefined, { shallow: true });
      } else {
        // For existing agents, just reset form state
        form.reset(form.getValues(), {
          keepValues: true,
        });
      }

      setIsSaving(false);
    } catch (error) {
      datadogLogger.error("Unexpected error:", {
        error: normalizeError(error),
      });
      setIsSaving(false);
    }
  };

  const handleFormErrors = (errors: Record<string, any>) => {
    const getFirstErrorMessage = (errorObj: Record<string, any>): string => {
      for (const key in errorObj) {
        if (errorObj[key]) {
          if (typeof errorObj[key] === "string") {
            return errorObj[key];
          }
          if (errorObj[key].message) {
            return errorObj[key].message;
          }
          if (typeof errorObj[key] === "object") {
            const nestedError = getFirstErrorMessage(errorObj[key]);
            if (nestedError) {
              return nestedError;
            }
          }
        }
      }
      return "Unknown error";
    };
    const errorMessage = getFirstErrorMessage(errors);
    datadogLogger.error(
      {
        errorMessage,
        agentConfigurationId: agentConfiguration?.sId,
      },
      "[Agent builder] - Form validation error"
    );
    sendNotification({
      title: `Agent ${agentConfiguration ? "edition" : "creation"} failed.`,
      description: "There was an error validating the form.",
      type: "error",
    });
    setIsSaving(false);
  };

  const handleSave = () => {
    void form.handleSubmit(handleSubmit, handleFormErrors)();
  };

  const handleCancel = async () => {
    await appLayoutBack(owner, router);
  };

  const { isDirty, isSubmitting } = form.formState;

  // Disable navigation lock during save process for new agents
  useNavigationLock((isDirty || !!duplicateAgentId) && !isSaving);

  const isSaveDisabled = duplicateAgentId
    ? false
    : isSubmitting || isActionsLoading || isTriggersLoading;

  const saveLabel = isSubmitting ? "Saving..." : "Save";

  const title = agentConfiguration
    ? duplicateAgentId
      ? `Duplicate @${agentConfiguration.name}`
      : `Edit agent @${agentConfiguration.name}`
    : "Create new agent";

  // Only load suggestions when not duplicating an existing agent.
  const suggestionsAgentId = duplicateAgentId
    ? null
    : (agentConfiguration?.sId ?? pendingAgentId ?? null);

  return (
    <AgentBuilderFormContext.Provider value={form}>
      <FormProvider form={form} asForm={false}>
        <CopilotSuggestionsProvider agentConfigurationId={suggestionsAgentId}>
          <AgentBuilderContent
            agentConfiguration={agentConfiguration}
            pendingAgentId={pendingAgentId}
            title={title}
            handleCancel={handleCancel}
            saveLabel={saveLabel}
            handleSave={handleSave}
            isSaveDisabled={isSaveDisabled}
            isTriggersLoading={isTriggersLoading}
            dialogProps={dialogProps}
            isCreatedDialogOpen={isCreatedDialogOpen}
            setIsCreatedDialogOpen={setIsCreatedDialogOpen}
            isNewAgent={!!duplicateAgentId || !agentConfiguration}
            templateId={assistantTemplate?.sId ?? copilotTemplateId ?? null}
            conversationId={conversationId}
          />
        </CopilotSuggestionsProvider>
      </FormProvider>
    </AgentBuilderFormContext.Provider>
  );
}

/**
 * Inner component that has access to FormContext and can use the MCP server hook.
 */
interface AgentBuilderContentProps {
  agentConfiguration?: LightAgentConfigurationType;
  pendingAgentId: string | null;
  title: string;
  handleCancel: () => Promise<void>;
  saveLabel: string;
  handleSave: () => void;
  isSaveDisabled: boolean;
  isTriggersLoading: boolean;
  dialogProps: {
    mcpServerViewsWithPersonalConnections: ReturnType<
      typeof useAwaitableDialog
    >["mcpServerViewsWithPersonalConnections"];
    isOpen: boolean;
    onCancel: () => void;
    onClose: () => void;
  };
  isCreatedDialogOpen: boolean;
  setIsCreatedDialogOpen: (open: boolean) => void;
  isNewAgent: boolean;
  templateId: string | null;
  conversationId?: string;
}

function AgentBuilderContent({
  agentConfiguration,
  pendingAgentId,
  title,
  handleCancel,
  saveLabel,
  handleSave,
  isSaveDisabled,
  isTriggersLoading,
  dialogProps,
  isCreatedDialogOpen,
  setIsCreatedDialogOpen,
  isNewAgent,
  templateId,
  conversationId,
}: AgentBuilderContentProps) {
  const { owner } = useAgentBuilderContext();
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const confirm = useContext(ConfirmContext);
  const sendNotification = useSendNotification();
  const suggestionsContext = useCopilotSuggestions();

  // Initialize the client-side MCP server for the agent builder copilot.
  // Only enabled when the agent_builder_copilot feature flag is active.
  const { serverId: clientSideMCPServerId } = useCopilotMCPServer({
    enabled: hasFeature("agent_builder_copilot"),
  });

  const handleSaveWithValidation = useCallback(async () => {
    const pendingInstructionSuggestions = suggestionsContext
      .getPendingSuggestions()
      .filter((s) => s.kind === "instructions");
    const committedInstructions =
      suggestionsContext.getCommittedInstructionsHtml();

    // Avoid allowing to save if there are no committed instructions.
    if (!committedInstructions.trim()) {
      const count = pendingInstructionSuggestions.length;
      sendNotification({
        title: "Cannot save agent",
        description:
          count > 0
            ? `Instructions are required. Review pending suggestion${pluralize(count)} first.`
            : "Instructions are required.",
        type: "error",
      });
      return;
    }

    if (pendingInstructionSuggestions.length > 0) {
      const confirmed = await confirm({
        title: "Pending suggestions",
        message: `You have ${pendingInstructionSuggestions.length} pending instruction suggestion${pluralize(pendingInstructionSuggestions.length)} that won't be included in this save. You can review ${pendingInstructionSuggestions.length === 1 ? "it" : "them"} later.`,
        validateLabel: "Save anyway",
        validateVariant: "primary",
        cancelLabel: "Go back",
      });

      if (!confirmed) {
        return;
      }
    }

    handleSave();
  }, [suggestionsContext, confirm, sendNotification, handleSave]);

  return (
    <>
      <PersonalConnectionRequiredDialog
        owner={owner}
        mcpServerViewsWithPersonalConnections={
          dialogProps.mcpServerViewsWithPersonalConnections
        }
        isOpen={dialogProps.isOpen}
        onCancel={dialogProps.onCancel}
        onClose={dialogProps.onClose}
      />
      {agentConfiguration && (
        <AgentCreatedDialog
          open={isCreatedDialogOpen}
          onOpenChange={setIsCreatedDialogOpen}
          agentName={agentConfiguration.name}
          agentId={agentConfiguration.sId}
          owner={owner}
        />
      )}
      <AgentBuilderLayout
        leftPanel={
          <AgentBuilderLeftPanel
            title={title}
            onCancel={handleCancel}
            saveButtonProps={{
              size: "sm",
              label: saveLabel,
              variant: "highlight",
              onClick: handleSaveWithValidation,
              disabled: isSaveDisabled,
            }}
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            agentConfigurationId={agentConfiguration?.sId || null}
            isTriggersLoading={isTriggersLoading}
          />
        }
        rightPanel={
          <CopilotPanelProvider
            targetAgentConfigurationId={
              agentConfiguration?.sId ?? pendingAgentId ?? null
            }
            targetAgentConfigurationVersion={agentConfiguration?.version ?? 0}
            clientSideMCPServerIds={
              clientSideMCPServerId ? [clientSideMCPServerId] : []
            }
            isNewAgent={isNewAgent}
            templateId={templateId}
            conversationId={conversationId}
          >
            <ConversationSidePanelProvider>
              <AgentBuilderRightPanel
                agentConfigurationSId={agentConfiguration?.sId}
                conversationId={conversationId}
              />
            </ConversationSidePanelProvider>
          </CopilotPanelProvider>
        }
      />
    </>
  );
}
