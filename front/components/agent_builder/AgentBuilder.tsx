import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/agentBuilderFormSchema";
import { getAgentBuilderFormSchema } from "@app/components/agent_builder/agentBuilderFormSchema";
import { AgentBuilderLayout } from "@app/components/agent_builder/AgentBuilderLayout";
import { AgentBuilderLeftPanel } from "@app/components/agent_builder/AgentBuilderLeftPanel";
import { AgentBuilderRightPanel } from "@app/components/agent_builder/AgentBuilderRightPanel";
import { AgentCreatedDialog } from "@app/components/agent_builder/AgentCreatedDialog";
import { useAgentBuilderFormHydration } from "@app/components/agent_builder/hooks/useAgentBuilderFormHydration";
import {
  PersonalConnectionRequiredDialog,
  useAwaitableDialog,
} from "@app/components/agent_builder/PersonalConnectionRequiredDialog";
import {
  SidekickSuggestionsProvider,
  useSidekickSuggestions,
} from "@app/components/agent_builder/sidekick/SidekickSuggestionsContext";
import { useSidekickMCPServer } from "@app/components/agent_builder/sidekick/useMCPServer";
import { SidekickPanelProvider } from "@app/components/agent_builder/SidekickPanelContext";
import { submitAgentBuilderForm } from "@app/components/agent_builder/submitAgentBuilderForm";
import { ConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FilePreviewProvider } from "@app/components/assistant/conversation/FilePreviewContext";
import { ConfirmContext } from "@app/components/Confirm";
import {
  BuilderEditorGateMessage,
  BuilderEditorLoadErrorMessage,
} from "@app/components/shared/BuilderEditorGateMessage";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { ConversationFontProvider } from "@app/components/sparkle/ConversationFontContext";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useBuilderTracking } from "@app/hooks/useBuilderTracking";
import { useNavigationLock } from "@app/hooks/useNavigationLock";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import {
  getDefaultAgentFormData,
  transformAgentConfigurationToFormData,
  transformDuplicateAgentToFormData,
  transformTemplateToFormData,
} from "@app/lib/agent_builder/transform_agent_configuration";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { useUpdateEditors } from "@app/lib/swr/agent_editors";
import { useModels } from "@app/lib/swr/models";
import { useFetcher } from "@app/lib/swr/swr";
import { getConversationRoute } from "@app/lib/utils/router";
import { removeParamFromRouter } from "@app/lib/utils/router_util";
import datadogLogger from "@app/logger/datadogLogger";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { TemplateInfo } from "@app/types/assistant/templates";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import {
  ContentMessage,
  ContentMessageAction,
  InfoCircle,
  RefreshCw02,
  Spinner,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import isEqual from "lodash/isEqual";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";

interface AgentBuilderProps {
  agentConfiguration?: AgentConfigurationType;
  duplicateAgentId?: string | null;
  conversationId?: string;
  onSaved?: () => void;
}

export default function AgentBuilder(props: AgentBuilderProps) {
  const { t } = useLingui();
  const { owner } = useAgentBuilderContext();
  const { defaultModel, isModelsError } = useModels({ owner });

  if (!props.agentConfiguration && !defaultModel) {
    if (isModelsError) {
      return (
        <div className="flex h-full w-full items-center justify-center p-4">
          <ContentMessage
            title={t`Unable to load models`}
            variant="warning"
            icon={InfoCircle}
            size="lg"
            action={
              <ContentMessageAction
                icon={RefreshCw02}
                label={t`Retry`}
                variant="warning"
                onClick={() => window.location.reload()}
              />
            }
          >
            <Trans>
              We could not determine the default model for this agent. Please
              try again.
            </Trans>
          </ContentMessage>
        </div>
      );
    }

    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <ConversationFontProvider>
      <AgentBuilderForm
        {...props}
        newAgentDefaultModel={
          props.agentConfiguration ? undefined : defaultModel!
        }
      />
    </ConversationFontProvider>
  );
}

interface AgentBuilderFormProps extends AgentBuilderProps {
  newAgentDefaultModel?: EnabledModelConfigurationType;
}

function AgentBuilderForm({
  agentConfiguration,
  duplicateAgentId,
  conversationId,
  onSaved,
  newAgentDefaultModel,
}: AgentBuilderFormProps) {
  const { t } = useLingui();
  const { owner, user, isAdmin, assistantTemplate } = useAgentBuilderContext();
  const { mcpServerViews } = useMCPServerViewsContext();
  const { fetcherWithBody } = useFetcher();
  const router = useAppRouter();
  const sendNotification = useSendNotification(true);
  const sendApiErrorNotification = useSendApiErrorNotification();
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingSelfAsEditor, setIsAddingSelfAsEditor] = useState(false);
  const [isCreatedDialogOpen, setIsCreatedDialogOpen] = useState(false);
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const hasPendingCreationRef = useRef(false);

  // A duplicate starts from an existing agent but produces a new one, so it is its own entry
  // point rather than an edit.
  const entryPoint = duplicateAgentId
    ? "duplicate"
    : agentConfiguration
      ? "edit"
      : "new";
  const { trackSave } = useBuilderTracking({ builder: "agent", entryPoint });

  const {
    hydratedValues,
    editors,
    isEditorsError,
    isEditorsLoading,
    isActionsLoading,
    isSkillsLoading,
    isTriggersLoading,
    hasLoadError: hasAgentDataLoadError,
    isValidating: isAgentDataValidating,
    isLoading: isAgentDataLoading,
    refresh: refreshAgentData,
    mutateEditors,
  } = useAgentBuilderFormHydration({ agentConfiguration, duplicateAgentId });

  const updateEditors = useUpdateEditors({
    owner,
    agentConfigurationId: agentConfiguration?.sId ?? null,
  });

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

    if (assistantTemplate && newAgentDefaultModel) {
      return transformTemplateToFormData(
        assistantTemplate,
        user,
        newAgentDefaultModel
      );
    }

    return getDefaultAgentFormData({
      user,
      defaultModel: newAgentDefaultModel!,
    });
  }, [
    agentConfiguration,
    duplicateAgentId,
    assistantTemplate,
    user,
    newAgentDefaultModel,
  ]);

  const agentBuilderFormSchema = useMemo(
    () => getAgentBuilderFormSchema(t),
    [t]
  );
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
      actions: hydratedValues.actions,
      skills: hydratedValues.skills,
      additionalSpaces: hydratedValues.additionalSpaces,
      triggersToCreate: hydratedValues.triggersToCreate,
      triggersToUpdate: hydratedValues.triggersToUpdate,
      triggersToDelete: hydratedValues.triggersToDelete,
      suggestedPrompts: hydratedValues.suggestedPrompts,
      agentSettings: {
        ...currentValues.agentSettings,
        slackProvider: hydratedValues.slackProvider,
        editors: hydratedValues.editors,
        slackChannels: hydratedValues.slackChannels,
      },
      // Templates may preset a model; override it with the backend default.
      ...(!agentConfiguration &&
        assistantTemplate &&
        newAgentDefaultModel && {
          generationSettings: {
            ...currentValues.generationSettings,
            modelSettings: {
              modelId: newAgentDefaultModel.modelId,
              providerId: newAgentDefaultModel.providerId,
            },
            reasoningEffort: newAgentDefaultModel.defaultReasoningEffort,
          },
        }),
    });
  }, [
    form,
    hydratedValues,
    isActionsLoading,
    isSkillsLoading,
    isTriggersLoading,
    agentConfiguration,
    assistantTemplate,
    newAgentDefaultModel,
  ]);

  const { showDialog, ...dialogProps } = useAwaitableDialog({
    owner,
    mcpServerViewToCheckIds: removeNulls(
      form.getValues("actions").map((a) => a.configuration.mcpServerViewId)
    ),
    mcpServerViews,
  });

  const isAdminExistingAgent =
    !!agentConfiguration && !duplicateAgentId && isAdmin;
  const isCurrentUserEditor = editors.some((editor) => editor.sId === user.sId);
  const isAdminNonEditor =
    isAdminExistingAgent &&
    !isEditorsLoading &&
    !isEditorsError &&
    !isCurrentUserEditor;
  const isEditorLocked =
    isAdminExistingAgent &&
    (isEditorsLoading || isEditorsError || !isCurrentUserEditor);

  const notifyLockedSave = useCallback(() => {
    if (isEditorsLoading) {
      sendNotification({
        title: t`Cannot save agent`,
        description: t`Wait until agent editors finish loading before saving.`,
        type: "error",
      });
      return;
    }

    if (isEditorsError) {
      sendNotification({
        title: t`Cannot save agent`,
        description: t`Retry loading editors before saving changes.`,
        type: "error",
      });
      return;
    }

    sendNotification({
      title: t`Cannot save agent`,
      description: t`Add yourself as an editor before saving changes.`,
      type: "error",
    });
  }, [isEditorsError, isEditorsLoading, sendNotification, t]);

  const handleAddSelfAsEditor = async () => {
    if (!agentConfiguration || isAddingSelfAsEditor) {
      return;
    }

    setIsAddingSelfAsEditor(true);
    try {
      await updateEditors({ addEditorIds: [user.sId] });
    } finally {
      setIsAddingSelfAsEditor(false);
    }
  };

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

  // Create pending agent on mount for NEW agents and DUPLICATES.
  useEffect(() => {
    if (
      (agentConfiguration && !duplicateAgentId) ||
      pendingAgentId ||
      hasPendingCreationRef.current
    ) {
      return;
    }
    hasPendingCreationRef.current = true;

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
            { statusCode: response.status },
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
    if (isEditorLocked) {
      return;
    }

    try {
      const confirmed = await showDialog();
      if (!confirmed) {
        return;
      }

      // For new agents (not editing or duplicating), use pendingAgentId as agentConfigurationId
      // For duplicating, pass null to create a new agent
      // For editing, pass the existing agent's sId
      const effectiveAgentConfigurationId = duplicateAgentId
        ? null
        : (agentConfiguration?.sId ?? pendingAgentId ?? null);

      const areSlackChannelsChanged = form.getFieldState(
        "agentSettings.slackChannels"
      ).isDirty;
      const areSuggestedPromptsChanged =
        form.getFieldState("suggestedPrompts").isDirty ||
        (!!duplicateAgentId && formData.suggestedPrompts.length > 0);

      const result = await submitAgentBuilderForm({
        user,
        formData,
        owner,
        isDraft: false,
        agentConfigurationId: effectiveAgentConfigurationId,
        areSlackChannelsChanged,
        areSuggestedPromptsChanged,
        fetcherWithBody,
      });

      if (!result.isOk()) {
        sendApiErrorNotification({
          title: agentConfiguration
            ? t`Error updating agent`
            : t`Error creating agent`,
          error: result.error,
        });
        return;
      }

      const createdAgent = result.value;
      const isCreatingNew = duplicateAgentId || !agentConfiguration;

      trackSave({
        agent_id: createdAgent.sId,
        is_update: !isCreatingNew,
        scope: formData.agentSettings.scope,
        has_instructions: !!formData.instructions,
        action_count: formData.actions.length,
        skill_count: formData.skills.length,
        trigger_count:
          formData.triggersToCreate.length + formData.triggersToUpdate.length,
        model_id: formData.generationSettings.modelSettings?.modelId ?? "",
        model_provider:
          formData.generationSettings.modelSettings?.providerId ?? "",
      });

      // A save can leave nothing to persist (config matched the current version, no scope/editor,
      // Slack or trigger change): tell the user instead of claiming a save. `triggersToUpdate` is
      // seeded with every existing trigger, so its length isn't a change signal; compare it by value
      // against its baseline since `useFieldArray.update()` doesn't reliably flip `isDirty`.
      const editedTriggers = !isEqual(
        form.getValues("triggersToUpdate"),
        form.formState.defaultValues?.triggersToUpdate ?? []
      );
      const hasTriggerChanges =
        formData.triggersToCreate.length > 0 ||
        formData.triggersToDelete.length > 0 ||
        editedTriggers;
      const nothingChanged =
        !isCreatingNew &&
        createdAgent._updated === false &&
        !areSlackChannelsChanged &&
        !hasTriggerChanges;

      // Check if there's a warning about Slack channel linking
      if (
        "_warning" in createdAgent &&
        createdAgent._warning === "slack_channel_linking_in_progress"
      ) {
        sendNotification({
          title: isCreatingNew ? t`Agent created` : t`Agent saved`,
          description: t`The agent has been saved successfully. Some channels are currently being linked, the operation will complete shortly.`,
          type: "info",
        });
      } else if (nothingChanged) {
        sendNotification({
          title: t`No changes to save`,
          description: t`This agent is already up to date.`,
          type: "info",
        });
      } else {
        sendNotification({
          title: isCreatingNew ? t`Agent created` : t`Agent saved`,
          description: isCreatingNew
            ? t`Agent created!`
            : t`Your agent has been successfully saved`,
          type: "success",
        });
      }

      await refreshAgentData();
      onSaved?.();

      if (isCreatingNew && createdAgent.sId) {
        const newUrl = `/w/${owner.sId}/builder/agents/${createdAgent.sId}?showCreatedDialog=1`;
        await router.replace(newUrl, undefined, { shallow: true });
      } else {
        // For existing agents, just reset form state
        form.reset(form.getValues(), {
          keepValues: true,
        });
      }
    } catch (error) {
      datadogLogger.error("Unexpected error:", {
        error: normalizeError(error),
      });
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
      return t`Unknown error`;
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
      title: agentConfiguration
        ? t`Agent edition failed.`
        : t`Agent creation failed.`,
      description: errorMessage,
      type: "error",
    });
  };

  const { isDirty, isSubmitting } = form.formState;

  // A pristine form has nothing to save; a duplicate always does (it starts clean but must be
  // created). Same "has unsaved work" test the navigation lock uses below.
  const hasUnsavedChanges = isDirty || !!duplicateAgentId;

  const isSaveDisabled =
    !hasUnsavedChanges ||
    isSubmitting ||
    hasAgentDataLoadError ||
    isAgentDataValidating ||
    isAgentDataLoading;

  const handleSave = async () => {
    if (isSaving || isSaveDisabled) {
      return;
    }

    if (isEditorLocked) {
      notifyLockedSave();
      return;
    }

    setIsSaving(true);
    try {
      await form.handleSubmit(handleSubmit, handleFormErrors)();
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (window.history.state?.idx > 0) {
      router.back();
    } else {
      void router.replace(getConversationRoute(owner.sId));
    }
  };

  // Disable navigation lock during save process for new agents
  useNavigationLock(hasUnsavedChanges && !isSaving);

  const saveLabel = isSubmitting ? t`Saving...` : t`Save`;

  const agentName = agentConfiguration?.name;
  const title = agentConfiguration
    ? duplicateAgentId
      ? t`Duplicate ${agentName}`
      : t`Edit agent ${agentName}`
    : t`Create new agent`;

  // Only load suggestions when not duplicating an existing agent.
  const suggestionsAgentId = duplicateAgentId
    ? pendingAgentId
    : (agentConfiguration?.sId ?? pendingAgentId ?? null);

  return (
    <FormProvider form={form} asForm={false}>
      <SidekickSuggestionsProvider
        agentConfigurationId={suggestionsAgentId}
        disabled={isEditorLocked}
      >
        <AgentBuilderContent
          agentConfiguration={agentConfiguration}
          pendingAgentId={pendingAgentId}
          title={title}
          handleCancel={handleCancel}
          saveLabel={saveLabel}
          handleSave={handleSave}
          isSaveDisabled={isSaveDisabled}
          isEditorLocked={isEditorLocked}
          isEditorLoadErrorVisible={isAdminExistingAgent && isEditorsError}
          isEditorGateVisible={isAdminNonEditor}
          isAddingSelfAsEditor={isAddingSelfAsEditor}
          isEditorsListUnavailable={isEditorsLoading || isEditorsError}
          onAddSelfAsEditor={() => {
            void handleAddSelfAsEditor();
          }}
          onRetryEditors={() => {
            void mutateEditors();
          }}
          isTriggersLoading={isTriggersLoading}
          dialogProps={dialogProps}
          isCreatedDialogOpen={isCreatedDialogOpen}
          setIsCreatedDialogOpen={setIsCreatedDialogOpen}
          isNewAgent={!!duplicateAgentId || !agentConfiguration}
          isDuplicate={!!duplicateAgentId}
          templateInfo={
            assistantTemplate
              ? {
                  templateId: assistantTemplate.sId,
                  sidekickInstructions: assistantTemplate.sidekickInstructions,
                }
              : undefined
          }
          conversationId={conversationId}
        />
      </SidekickSuggestionsProvider>
    </FormProvider>
  );
}

/**
 * Inner component that has access to FormContext and can use the MCP server hook.
 */
interface AgentBuilderContentProps {
  agentConfiguration?: AgentConfigurationType;
  pendingAgentId: string | null;
  title: string;
  handleCancel: () => void;
  saveLabel: string;
  handleSave: () => void;
  isSaveDisabled: boolean;
  isEditorLocked: boolean;
  isEditorLoadErrorVisible: boolean;
  isEditorGateVisible: boolean;
  isAddingSelfAsEditor: boolean;
  isEditorsListUnavailable: boolean;
  onAddSelfAsEditor: () => void;
  onRetryEditors: () => void;
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
  isDuplicate: boolean;
  templateInfo?: TemplateInfo;
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
  isEditorLocked,
  isEditorLoadErrorVisible,
  isEditorGateVisible,
  isAddingSelfAsEditor,
  isEditorsListUnavailable,
  onAddSelfAsEditor,
  onRetryEditors,
  isTriggersLoading,
  dialogProps,
  isCreatedDialogOpen,
  setIsCreatedDialogOpen,
  isNewAgent,
  isDuplicate,
  templateInfo,
  conversationId,
}: AgentBuilderContentProps) {
  const { t } = useLingui();
  const { owner } = useAgentBuilderContext();
  const confirm = useContext(ConfirmContext);
  const sendNotification = useSendNotification();
  const { pendingSuggestions, getCommittedInstructionsHtml } =
    useSidekickSuggestions();

  const { serverId: clientSideMCPServerId } = useSidekickMCPServer({
    enabled: !isEditorLocked,
  });

  const clientSideMCPServerIds = useMemo(
    () => (clientSideMCPServerId ? [clientSideMCPServerId] : []),
    [clientSideMCPServerId]
  );

  const handleSaveWithValidation = useCallback(async () => {
    if (isEditorLocked) {
      handleSave();
      return;
    }

    const pendingInstructionSuggestions = pendingSuggestions.filter(
      (s) => s.kind === "instructions"
    );
    const committedInstructions = getCommittedInstructionsHtml();

    // Avoid allowing to save if there are no committed instructions.
    if (!committedInstructions.trim()) {
      const count = pendingInstructionSuggestions.length;
      sendNotification({
        title: t`Cannot save agent`,
        description:
          count > 0
            ? t`${plural(count, {
                one: "Instructions are required. Review pending suggestion first.",
                other:
                  "Instructions are required. Review pending suggestions first.",
              })}`
            : t`Instructions are required.`,
        type: "error",
      });
      return;
    }

    if (pendingInstructionSuggestions.length > 0) {
      const pendingCount = pendingInstructionSuggestions.length;
      const confirmed = await confirm({
        title: t`Pending suggestions`,
        message: t`${plural(pendingCount, {
          one: "You have # pending instruction suggestion that won't be included in this save. You can review it later.",
          other:
            "You have # pending instruction suggestions that won't be included in this save. You can review them later.",
        })}`,
        validateLabel: t`Save anyway`,
        validateVariant: "primary",
        cancelLabel: t`Go back`,
      });

      if (!confirmed) {
        return;
      }
    }

    handleSave();
  }, [
    isEditorLocked,
    pendingSuggestions,
    getCommittedInstructionsHtml,
    confirm,
    sendNotification,
    handleSave,
    t,
  ]);

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
            editorGateMessage={
              isEditorLoadErrorVisible ? (
                <BuilderEditorLoadErrorMessage
                  builderType="agent"
                  onRetry={onRetryEditors}
                />
              ) : isEditorGateVisible ? (
                <BuilderEditorGateMessage
                  builderType="agent"
                  isLoading={isAddingSelfAsEditor}
                  onAddSelfAsEditor={onAddSelfAsEditor}
                />
              ) : null
            }
            agentConfigurationId={agentConfiguration?.sId || null}
            isTriggersLoading={isTriggersLoading}
            initialRequestedSpaceIds={agentConfiguration?.requestedSpaceIds}
            isEditorGateVisible={isEditorGateVisible}
            isAddingSelfAsEditor={isAddingSelfAsEditor}
            isEditorsListUnavailable={isEditorsListUnavailable}
            onAddSelfAsEditor={onAddSelfAsEditor}
          />
        }
        rightPanel={
          <SidekickPanelProvider
            targetAgentConfigurationId={
              // For duplicates, use the pending agent sId (not the source agent's sId).
              // Targeting the source would store suggestions against the original agent.
              isDuplicate
                ? pendingAgentId
                : (agentConfiguration?.sId ?? pendingAgentId ?? null)
            }
            targetAgentConfigurationVersion={agentConfiguration?.version ?? 0}
            clientSideMCPServerIds={clientSideMCPServerIds}
            isNewAgent={isNewAgent}
            isDuplicate={isDuplicate}
            templateInfo={templateInfo}
            conversationId={conversationId}
            suppressAutoStart={isCreatedDialogOpen}
          >
            <ConversationSidePanelProvider>
              <FilePreviewProvider owner={owner}>
                <AgentBuilderRightPanel
                  agentConfiguration={agentConfiguration}
                  isSidekickDisabled={isEditorLocked}
                />
              </FilePreviewProvider>
            </ConversationSidePanelProvider>
          </SidekickPanelProvider>
        }
      />
    </>
  );
}
