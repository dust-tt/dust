import "react-image-crop/dist/ReactCrop.css";

import {
  Button,
  SidebarRightCloseIcon,
  SidebarRightOpenIcon,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import assert from "assert";
import uniqueId from "lodash/uniqueId";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";

import {
  PersonalConnectionRequiredDialog,
  useAwaitableDialog,
} from "@app/components/agent_builder/PersonalConnectionRequiredDialog";
import { ConversationSidePanelProvider } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import ActionsScreen, {
  hasActionError,
} from "@app/components/assistant_builder/ActionsScreen";
import AssistantBuilderRightPanel from "@app/components/assistant_builder/AssistantBuilderPreviewDrawer";
import { BuilderLayout } from "@app/components/assistant_builder/BuilderLayout";
import { useAssistantBuilderContext } from "@app/components/assistant_builder/contexts/AssistantBuilderContexts";
import { useMCPServerViewsContext } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { usePreviewPanelContext } from "@app/components/assistant_builder/contexts/PreviewPanelContext";
import {
  INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
  InstructionScreen,
} from "@app/components/assistant_builder/InstructionScreen";
import { PrevNextButtons } from "@app/components/assistant_builder/PrevNextButtons";
import SettingsScreen, {
  validateHandle,
} from "@app/components/assistant_builder/SettingsScreen";
import { submitAssistantBuilderForm } from "@app/components/assistant_builder/submitAssistantBuilderForm";
import type {
  AssistantBuilderLightProps,
  BuilderScreen,
} from "@app/components/assistant_builder/types";
import {
  BUILDER_SCREENS,
  BUILDER_SCREENS_INFOS,
  getDataVisualizationActionConfiguration,
} from "@app/components/assistant_builder/types";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import { useSlackChannel } from "@app/components/assistant_builder/useSlackChannels";
import { useTemplate } from "@app/components/assistant_builder/useTemplate";
import AppContentLayout, {
  appLayoutBack,
} from "@app/components/sparkle/AppContentLayout";
import {
  AppLayoutSimpleCloseTitle,
  AppLayoutSimpleSaveCancelTitle,
} from "@app/components/sparkle/AppLayoutTitle";
import { useHashParam } from "@app/hooks/useHashParams";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAssistantConfigurationActions } from "@app/lib/swr/actions";
import { useAgentTriggers } from "@app/lib/swr/agent_triggers";
import { useKillSwitches } from "@app/lib/swr/kill";
import { useModels } from "@app/lib/swr/models";
import { useUser } from "@app/lib/swr/user";
import {
  assertNever,
  isAdmin,
  isBuilder,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";

function isValidTab(tab: string): tab is BuilderScreen {
  return BUILDER_SCREENS.includes(tab as BuilderScreen);
}

export default function AssistantBuilder({
  owner,
  subscription,
  initialBuilderState,
  agentConfiguration,
  flow,
  baseUrl,
  defaultTemplate,
  duplicateAgentId,
}: AssistantBuilderLightProps) {
  const router = useRouter();
  const sendNotification = useSendNotification();
  const { user, isUserLoading, isUserError } = useUser();

  const { killSwitches } = useKillSwitches();
  const { models, reasoningModels } = useModels({ owner });

  const isSavingDisabled = killSwitches?.includes("save_agent_configurations");

  const { builderState, setBuilderState, edited, setEdited } =
    useAssistantBuilderContext();

  const [currentTab, setCurrentTab] = useHashParam(
    "selectedTab",
    "instructions"
  );
  const [screen, setScreen] = useState<BuilderScreen>(
    currentTab && isValidTab(currentTab) ? currentTab : "instructions"
  );
  //const [edited, setEdited] = useState(defaultIsEdited ?? false);
  const [isSavingOrDeleting, setIsSavingOrDeleting] = useState(false);
  const [disableUnsavedChangesPrompt, setDisableUnsavedChangesPrompt] =
    useState(false);

  // The 4 kind of errors that can be displayed in the agent builder
  const [assistantHandleError, setAssistantHandleError] = useState<
    string | null
  >(null);
  const [instructionsError, setInstructionsError] = useState<string | null>(
    null
  );
  const [isInstructionDiffMode, setIsInstructionDiffMode] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [hasAnyActionsError, setHasAnyActionsError] = useState<boolean>(false);

  // You can duplicate another agent, so if it's for duplicate we will use that agent ID to fetch actions and copy it.
  // Otherwise, for existing agents we use the ID of the agent, and for new agents we don't fetch anything
  // since there will be no actions yet.
  const { actions, isActionsLoading, error } = useAssistantConfigurationActions(
    owner.sId,
    duplicateAgentId ?? agentConfiguration?.sId ?? null
  );

  const { triggers, isTriggersLoading } = useAgentTriggers({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration?.sId ?? null,
  });

  useEffect(() => {
    if (error) {
      sendNotification({
        title: "Could not retrieve actions",
        description:
          "There was an error retrieving the actions for this agent.",
        type: "error",
      });
      return;
    }

    setBuilderState((prevState) => ({
      ...prevState,
      actions: [
        ...actions.map((action) => ({
          id: uniqueId(),
          ...action,
        })),
        ...(prevState.visualizationEnabled
          ? [getDataVisualizationActionConfiguration()]
          : []),
      ],
      triggers: triggers.map((trigger) => ({
        sId: uniqueId(),
        kind: trigger.kind,
        name: trigger.name,
        configuration: trigger.configuration,
        editor: trigger.editor,
        customPrompt: trigger.customPrompt ?? "",
      })),
    }));
  }, [actions, triggers, error, sendNotification, setBuilderState]);

  const {
    template,
    instructionsResetAt,
    removeTemplate,
    resetToTemplateInstructions,
    resetToTemplateActions,
  } = useTemplate(defaultTemplate);

  const {
    provider,
    slackDataSource,
    selectedSlackChannels,
    slackChannelsLinkedWithAgent,
    setSelectedSlackChannels,
    mutateSlackChannels,
  } = useSlackChannel({
    initialChannels: [],
    workspaceId: owner.sId,
    isPrivateAssistant: builderState.scope === "hidden",
    isBuilder: isBuilder(owner),
    isEdited: edited,
    agentConfigurationId: agentConfiguration?.sId ?? null,
  });
  useNavigationLock(edited && !disableUnsavedChangesPrompt);
  const { isPreviewPanelOpen, setIsPreviewPanelOpen } =
    usePreviewPanelContext();

  const { mcpServerViews } = useMCPServerViewsContext();

  const checkUsernameTimeout = React.useRef<NodeJS.Timeout | null>(null);

  // If agent is created, the user creating it should be added to the builder
  // editors list. If not, then the user should be in this list.
  useEffect(() => {
    if (isUserError || isUserLoading || !user) {
      return;
    }
    if (agentConfiguration?.sId && initialBuilderState) {
      assert(
        isAdmin(owner) ||
          initialBuilderState.editors.some((m) => m.sId === user.sId),
        "Unreachable: User is not in editors nor admin"
      );
    }
    if (!agentConfiguration?.sId) {
      setBuilderState((state) => ({
        ...state,
        editors: state.editors.some((m) => m.sId === user.sId)
          ? state.editors
          : [...state.editors, user],
      }));
    }
  }, [
    isUserLoading,
    isUserError,
    user,
    owner,
    agentConfiguration?.sId,
    initialBuilderState,
    setBuilderState,
  ]);

  const formValidation = useCallback(async () => {
    const modelConfig = SUPPORTED_MODEL_CONFIGS.filter(
      (config) =>
        config.modelId === builderState.generationSettings.modelSettings.modelId
    )[0];
    if (!modelConfig) {
      // unreachable
      throw new Error("Model configuration not found");
    }

    const { handleErrorMessage } = await validateHandle({
      owner,
      handle: builderState.handle,
      initialHandle: initialBuilderState?.handle,
      checkUsernameTimeout,
    });
    setAssistantHandleError(handleErrorMessage);

    let localDescriptionError: string | null = null;
    if (!builderState.description?.trim()) {
      localDescriptionError = "You must provide a description.";
    }
    setDescriptionError(localDescriptionError);

    let localInstructionError: string | null = null;
    if (!builderState.instructions?.trim()) {
      localInstructionError = "You must provide some instructions.";
    } else if (
      builderState.instructions &&
      builderState.instructions.length > INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT
    ) {
      localInstructionError = `Instructions must be less than ${INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT} characters.`;
    } else if (
      builderState.instructions &&
      builderState.instructions.trim().length / 4 >
        modelConfig.contextSize * 0.9
    ) {
      localInstructionError = `Instructions may exceed context size window.`;
    }

    if (!isInstructionDiffMode) {
      // We only keep the first error. If there are multiple errors, the user will have to fix them one by one.
      setInstructionsError(localInstructionError);
    }

    // Check if there are any errors in the actions
    const anyActionError =
      mcpServerViews.length > 0 &&
      builderState.actions.some((action) =>
        hasActionError(action, mcpServerViews)
      );

    setHasAnyActionsError(anyActionError);
  }, [
    owner,
    builderState.handle,
    builderState.description,
    builderState.instructions,
    builderState.actions,
    builderState.generationSettings.modelSettings.modelId,
    initialBuilderState?.handle,
    isInstructionDiffMode,
    mcpServerViews,
  ]);

  useEffect(() => {
    if (edited) {
      void formValidation();
    }
  }, [edited, formValidation]);

  useEffect(() => {
    if (currentTab && isValidTab(currentTab)) {
      setScreen(currentTab);
    }
  }, [currentTab]);

  const { showDialog, ...dialogProps } = useAwaitableDialog({
    owner,
    mcpServerViewToCheckIds: builderState.actions.map(
      (a) => a.configuration.mcpServerViewId
    ),
    mcpServerViews,
  });

  const onAssistantSave = async () => {
    // Redirect to the right screen if there are errors.
    if (instructionsError) {
      setCurrentTab("instructions");
    } else if (hasAnyActionsError) {
      setCurrentTab("actions");
    } else if (assistantHandleError || descriptionError) {
      setCurrentTab("settings");
    } else {
      const confirmed = await showDialog();
      if (!confirmed) {
        return;
      }

      setDisableUnsavedChangesPrompt(true);
      setIsSavingOrDeleting(true);
      const res = await submitAssistantBuilderForm({
        owner,
        builderState,
        agentConfigurationId: agentConfiguration?.sId ?? null,
        slackData: {
          provider,
          selectedSlackChannels: selectedSlackChannels || [],
          slackChannelsLinkedWithAgent,
        },
      });

      if (res.isErr()) {
        setIsSavingOrDeleting(false);
        sendNotification({
          title: "Error saving Agent",
          description: res.error.message,
          type: "error",
        });
      } else {
        if (slackDataSource) {
          await mutateSlackChannels();
        }

        if (isBuilder(owner)) {
          // Redirect to the agent list once saved.
          if (flow === "personal_assistants") {
            await router.push(
              `/w/${owner.sId}/assistant/new?selectedTab=personal`
            );
          } else {
            await router.push(`/w/${owner.sId}/builder/assistants`);
          }
        } else {
          await router.push(`/w/${owner.sId}/assistant/new`);
        }
      }
    }
  };

  const [doTypewriterEffect, setDoTypewriterEffect] = useState(
    Boolean(template !== null && initialBuilderState?.instructions)
  );

  const modalTitle = duplicateAgentId
    ? `Duplicate @${builderState.handle}`
    : agentConfiguration
      ? `Edit @${builderState.handle}`
      : "New Agent";

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
      <AppContentLayout subscription={subscription} hideSidebar owner={owner}>
        <div className="flex h-full flex-col">
          {!edited ? (
            <AppLayoutSimpleCloseTitle
              title={modalTitle}
              onClose={async () => {
                await appLayoutBack(owner, router);
              }}
            />
          ) : (
            <AppLayoutSimpleSaveCancelTitle
              title={modalTitle}
              onCancel={async () => {
                await appLayoutBack(owner, router);
              }}
              onSave={isSavingDisabled ? undefined : onAssistantSave}
              isSaving={isSavingOrDeleting}
              saveTooltip={
                isSavingDisabled
                  ? "Saving agents is temporarily disabled and will be re-enabled shortly."
                  : undefined
              }
            />
          )}
          <BuilderLayout
            leftPanel={
              <div className="flex h-full flex-col gap-4 pb-6 pt-4">
                <div className="flex flex-row justify-between sm:flex-row">
                  <Tabs
                    className="w-full"
                    onValueChange={(t) => {
                      setCurrentTab(t);
                    }}
                    value={screen}
                  >
                    <TabsList>
                      {Object.values(BUILDER_SCREENS_INFOS).map((tab) => (
                        <TabsTrigger
                          key={tab.label}
                          value={tab.id}
                          label={tab.label}
                          icon={tab.icon}
                          data-gtm-label={tab.dataGtm.label}
                          data-gtm-location={tab.dataGtm.location}
                        />
                      ))}
                    </TabsList>
                  </Tabs>
                  <div className="border-b border-border">
                    <Button
                      icon={
                        isPreviewPanelOpen
                          ? SidebarRightCloseIcon
                          : SidebarRightOpenIcon
                      }
                      variant="ghost"
                      tooltip={
                        isPreviewPanelOpen ? "Hide preview" : "Open preview"
                      }
                      onClick={() => setIsPreviewPanelOpen(!isPreviewPanelOpen)}
                    />
                  </div>
                </div>
                <div className="flex h-full justify-center">
                  <div className="h-full w-full max-w-4xl">
                    {(() => {
                      switch (screen) {
                        case "instructions":
                          return (
                            <InstructionScreen
                              owner={owner}
                              resetAt={instructionsResetAt}
                              isUsingTemplate={template !== null}
                              instructionsError={instructionsError}
                              doTypewriterEffect={doTypewriterEffect}
                              setDoTypewriterEffect={setDoTypewriterEffect}
                              agentConfigurationId={
                                agentConfiguration?.sId ?? null
                              }
                              models={models}
                              setIsInstructionDiffMode={
                                setIsInstructionDiffMode
                              }
                              isInstructionDiffMode={isInstructionDiffMode}
                            />
                          );
                        case "actions":
                          return (
                            <ActionsScreen
                              owner={owner}
                              reasoningModels={reasoningModels}
                              isFetchingActions={isActionsLoading}
                            />
                          );

                        case "settings":
                          return (
                            <SettingsScreen
                              agentConfigurationId={
                                agentConfiguration?.sId ?? null
                              }
                              baseUrl={baseUrl}
                              owner={owner}
                              initialHandle={initialBuilderState?.handle}
                              assistantHandleError={assistantHandleError}
                              descriptionError={descriptionError}
                              slackChannelSelected={selectedSlackChannels || []}
                              slackDataSource={slackDataSource}
                              setSelectedSlackChannels={
                                setSelectedSlackChannels
                              }
                              currentUser={user}
                              isTriggersLoading={isTriggersLoading}
                            />
                          );
                        default:
                          assertNever(screen);
                      }
                    })()}
                  </div>
                </div>
                <div className="mt-auto flex-shrink-0">
                  <PrevNextButtons
                    screen={screen}
                    setCurrentTab={setCurrentTab}
                  />
                </div>
              </div>
            }
            rightPanel={
              <ConversationSidePanelProvider>
                <AssistantBuilderRightPanel
                  screen={screen}
                  template={template}
                  mcpServerViews={mcpServerViews}
                  removeTemplate={removeTemplate}
                  resetToTemplateInstructions={async () => {
                    resetToTemplateInstructions(setBuilderState);
                    setEdited(true);
                  }}
                  resetToTemplateActions={async () => {
                    resetToTemplateActions(setBuilderState);
                    setEdited(true);
                  }}
                  owner={owner}
                  agentConfiguration={agentConfiguration}
                />
              </ConversationSidePanelProvider>
            }
          />
        </div>
      </AppContentLayout>
    </>
  );
}
