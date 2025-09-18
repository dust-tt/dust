import { zodResolver } from "@hookform/resolvers/zod";
import set from "lodash/set";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AdditionalConfigurationInBuilderType,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  AgentBuilderFormContext,
  agentBuilderFormSchema,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderLayout } from "@app/components/agent_builder/AgentBuilderLayout";
import { AgentBuilderLeftPanel } from "@app/components/agent_builder/AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "@app/components/agent_builder/AgentBuilderRightPanel";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
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
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import { ConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AssistantBuilderMCPConfigurationWithId } from "@app/components/assistant_builder/types";
import { getDataVisualizationActionConfiguration } from "@app/components/assistant_builder/types";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import type { AdditionalConfigurationType } from "@app/lib/models/assistant/actions/mcp";
import { useAgentConfigurationActions } from "@app/lib/swr/actions";
import { useAgentTriggers } from "@app/lib/swr/agent_triggers";
import { useSlackChannelsLinkedWithAgent } from "@app/lib/swr/assistants";
import { useEditors } from "@app/lib/swr/editors";
import { emptyArray } from "@app/lib/swr/swr";
import datadogLogger from "@app/logger/datadogLogger";
import type { LightAgentConfigurationType } from "@app/types";
import { isBuilder, removeNulls } from "@app/types";
import { normalizeError } from "@app/types";

function processActionsFromStorage(
  actions: AssistantBuilderMCPConfigurationWithId[],
  visualizationEnabled: boolean
): AgentBuilderAction[] {
  const visualizationAction = visualizationEnabled
    ? [getDataVisualizationActionConfiguration()]
    : [];
  return [
    ...visualizationAction,
    ...actions.map((action) => {
      if (action.type === "MCP") {
        return {
          ...action,
          configuration: {
            ...action.configuration,
            additionalConfiguration: processAdditionalConfigurationFromStorage(
              action.configuration.additionalConfiguration
            ),
          },
        };
      }
      return action;
    }),
  ];
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
}

export default function AgentBuilder({
  agentConfiguration,
  duplicateAgentId,
}: AgentBuilderProps) {
  const { owner, user, assistantTemplate } = useAgentBuilderContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  const { mcpServerViews } = useMCPServerViewsContext();

  const router = useRouter();
  const sendNotification = useSendNotification(true);
  const [isSaving, setIsSaving] = useState(false);

  const { actions, isActionsLoading } = useAgentConfigurationActions(
    owner.sId,
    duplicateAgentId ?? agentConfiguration?.sId ?? null
  );

  const { triggers, isTriggersLoading } = useAgentTriggers({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration?.sId ?? null,
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
    return processActionsFromStorage(
      actions ?? emptyArray(),
      agentConfiguration?.visualizationEnabled ?? false
    );
  }, [actions, agentConfiguration?.visualizationEnabled]);

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

  const formValues = useMemo((): AgentBuilderFormData => {
    let baseValues: AgentBuilderFormData;

    if (duplicateAgentId && agentConfiguration) {
      // Handle agent duplication case
      baseValues = transformDuplicateAgentToFormData(agentConfiguration, user);
    } else if (agentConfiguration) {
      baseValues = transformAgentConfigurationToFormData(agentConfiguration);
    } else if (assistantTemplate) {
      baseValues = transformTemplateToFormData(assistantTemplate, user);
    } else {
      baseValues = getDefaultAgentFormData(user);
    }

    return {
      ...baseValues,
      actions: processedActions,
      triggers: duplicateAgentId
        ? triggers.map((trigger) => ({
            ...trigger,
            editor: user.id,
          }))
        : triggers ?? emptyArray(),

      agentSettings: {
        ...baseValues.agentSettings,
        slackProvider,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        editors:
          duplicateAgentId || editors.length === 0 || !agentConfiguration
            ? [user]
            : editors,
        slackChannels: agentSlackChannels,
      },
    };
  }, [
    agentConfiguration,
    assistantTemplate,
    user,
    duplicateAgentId,
    processedActions,
    slackProvider,
    editors,
    triggers,
    agentSlackChannels,
  ]);

  const form = useForm<AgentBuilderFormData>({
    resolver: zodResolver(agentBuilderFormSchema),
    values: formValues,
    resetOptions: {
      keepDirtyValues: true,
      keepErrors: true,
    },
  });

  const { showDialog, ...dialogProps } = useAwaitableDialog({
    owner,
    mcpServerViewToCheckIds: removeNulls(
      form
        .getValues("actions")
        .map((a) => (a.type === "MCP" ? a.configuration.mcpServerViewId : null))
    ),
    mcpServerViews,
  });

  const handleSubmit = async (formData: AgentBuilderFormData) => {
    try {
      setIsSaving(true);
      const confirmed = await showDialog();
      if (!confirmed) {
        setIsSaving(false);
        return;
      }

      const result = await submitAgentBuilderForm({
        formData,
        owner,
        isDraft: false,
        agentConfigurationId: duplicateAgentId
          ? null
          : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            agentConfiguration?.sId || null,
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

      if (isCreatingNew && createdAgent.sId) {
        const newUrl = `/w/${owner.sId}/builder/agents/${createdAgent.sId}`;
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

  return (
    <AgentBuilderFormContext.Provider value={form}>
      <FormProvider form={form}>
        <PersonalConnectionRequiredDialog
          owner={owner}
          mcpServerViewsWithPersonalConnections={
            dialogProps.mcpServerViewsWithPersonalConnections
          }
          isOpen={dialogProps.isOpen}
          onCancel={dialogProps.onCancel}
          onClose={dialogProps.onClose}
        />
        <AgentBuilderLayout
          leftPanel={
            <AgentBuilderLeftPanel
              title={title}
              onCancel={handleCancel}
              saveButtonProps={{
                size: "sm",
                label: saveLabel,
                variant: "highlight",
                onClick: handleSave,
                disabled: isSaveDisabled,
              }}
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              agentConfigurationId={agentConfiguration?.sId || null}
              isActionsLoading={isActionsLoading}
              isTriggersLoading={isTriggersLoading}
            />
          }
          rightPanel={
            <ConversationSidePanelProvider>
              <AgentBuilderRightPanel
                agentConfigurationSId={agentConfiguration?.sId}
              />
            </ConversationSidePanelProvider>
          }
        />
      </FormProvider>
    </AgentBuilderFormContext.Provider>
  );
}
