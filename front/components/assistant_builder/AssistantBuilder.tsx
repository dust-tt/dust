import "react-image-crop/dist/ReactCrop.css";

import {
  BarChartIcon,
  Button,
  ChatBubbleBottomCenterTextIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  cn,
  MagicIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  useHashParam,
  useSendNotification,
} from "@dust-tt/sparkle";
import assert from "assert";
import { uniqueId } from "lodash";
import { useRouter } from "next/router";
import React, { useCallback, useContext, useEffect, useState } from "react";

import ActionsScreen, {
  hasActionError,
} from "@app/components/assistant_builder/ActionsScreen";
import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import AssistantBuilderRightPanel from "@app/components/assistant_builder/AssistantBuilderPreviewDrawer";
import { BuilderLayout } from "@app/components/assistant_builder/BuilderLayout";
import {
  INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
  InstructionScreen,
} from "@app/components/assistant_builder/InstructionScreen";
import { PrevNextButtons } from "@app/components/assistant_builder/PrevNextButtons";
import SettingsScreen, {
  validateHandle,
} from "@app/components/assistant_builder/SettingsScreen";
import { SharingButton } from "@app/components/assistant_builder/Sharing";
import { submitAssistantBuilderForm } from "@app/components/assistant_builder/submitAssistantBuilderForm";
import type {
  AssistantBuilderPendingAction,
  AssistantBuilderProps,
  AssistantBuilderSetActionType,
  AssistantBuilderState,
  BuilderScreen,
} from "@app/components/assistant_builder/types";
import {
  BUILDER_SCREENS,
  BUILDER_SCREENS_INFOS,
  getDefaultAssistantState,
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
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useKillSwitches } from "@app/lib/swr/kill";
import { useModels } from "@app/lib/swr/models";
import { useUser } from "@app/lib/swr/user";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  AgentConfigurationScope,
  AssistantBuilderRightPanelStatus,
  AssistantBuilderRightPanelTab,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  GPT_4_1_MINI_MODEL_CONFIG,
  isAdmin,
  isBuilder,
  isUser,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";

function isValidTab(tab: string): tab is BuilderScreen {
  return BUILDER_SCREENS.includes(tab as BuilderScreen);
}

/**
 * TODO(agent discovery, 2025-04-30): Delete this function when removing scopes
 * "workspace" and "published"
 */
function isLegacyAllowed(
  owner: WorkspaceType,
  agentConfigurationScope: AgentConfigurationScope
): boolean {
  if (agentConfigurationScope === "workspace" && isBuilder(owner)) {
    return true;
  }
  if (agentConfigurationScope === "published" && isUser(owner)) {
    return true;
  }
  return false;
}

export default function AssistantBuilder({
  owner,
  subscription,
  plan,
  initialBuilderState,
  agentConfigurationId,
  flow,
  defaultIsEdited,
  baseUrl,
  defaultTemplate,
}: AssistantBuilderProps) {
  const router = useRouter();
  const sendNotification = useSendNotification();
  const { user, isUserLoading, isUserError } = useUser();

  const { killSwitches } = useKillSwitches();
  const { models, reasoningModels } = useModels({ owner });

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const isAgentDiscoveryEnabled = featureFlags.includes("agent_discovery");

  const isSavingDisabled = killSwitches?.includes("save_agent_configurations");

  const defaultScope = isAgentDiscoveryEnabled
    ? flow === "personal_assistants"
      ? "hidden"
      : "visible"
    : flow === "personal_assistants"
      ? "private"
      : "workspace";

  const [currentTab, setCurrentTab] = useHashParam(
    "selectedTab",
    "instructions"
  );
  const [screen, setScreen] = useState<BuilderScreen>(
    currentTab && isValidTab(currentTab) ? currentTab : "instructions"
  );
  const [edited, setEdited] = useState(defaultIsEdited ?? false);
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

  const [builderState, setBuilderState] = useState<AssistantBuilderState>(
    initialBuilderState
      ? {
          handle: initialBuilderState.handle,
          description: initialBuilderState.description,
          scope: initialBuilderState.scope,
          instructions: initialBuilderState.instructions,
          avatarUrl: initialBuilderState.avatarUrl,
          generationSettings: initialBuilderState.generationSettings ?? {
            ...getDefaultAssistantState().generationSettings,
          },
          actions: initialBuilderState.actions.map((action) => ({
            id: uniqueId(),
            ...action,
          })),
          maxStepsPerRun:
            initialBuilderState.maxStepsPerRun ??
            getDefaultAssistantState().maxStepsPerRun,
          visualizationEnabled: initialBuilderState.visualizationEnabled,
          templateId: initialBuilderState.templateId,
          tags: initialBuilderState.tags,
          editors: initialBuilderState.editors,
        }
      : {
          ...getDefaultAssistantState(),
          scope: defaultScope,
          generationSettings: {
            ...getDefaultAssistantState().generationSettings,
            modelSettings: !isUpgraded(plan)
              ? GPT_4_1_MINI_MODEL_CONFIG
              : CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
          },
        }
  );

  const [pendingAction, setPendingAction] =
    useState<AssistantBuilderPendingAction>({
      action: null,
      previousActionName: null,
    });

  const {
    template,
    instructionsResetAt,
    removeTemplate,
    resetToTemplateInstructions,
    resetToTemplateActions,
  } = useTemplate(defaultTemplate);

  const {
    slackDataSource,
    showSlackIntegration,
    selectedSlackChannels,
    slackChannelsLinkedWithAgent,
    setSelectedSlackChannels,
    mutateSlackChannels,
  } = useSlackChannel({
    initialChannels: [],
    workspaceId: owner.sId,
    isPrivateAssistant:
      builderState.scope === "private" || builderState.scope === "hidden",
    isBuilder: isBuilder(owner),
    isEdited: edited,
    agentConfigurationId,
  });
  useNavigationLock(edited && !disableUnsavedChangesPrompt);
  const { mcpServerViews } = useContext(AssistantBuilderContext);

  const checkUsernameTimeout = React.useRef<NodeJS.Timeout | null>(null);

  const [rightPanelStatus, setRightPanelStatus] =
    useState<AssistantBuilderRightPanelStatus>({
      tab:
        template != null
          ? "Template"
          : screen == "instructions"
            ? "Preview"
            : null,
      openedAt: screen == "instructions" ? Date.now() : null,
    });

  // We deactivate the Preview button if the BuilderState is empty (= no instructions, no tools)
  const isBuilderStateEmpty =
    !builderState.instructions?.trim() && !builderState.actions.length;

  const [isPreviewButtonAnimating, setIsPreviewButtonAnimating] =
    useState(false);

  const triggerPreviewButtonAnimation = () => {
    setIsPreviewButtonAnimating(true);
    setTimeout(() => {
      setIsPreviewButtonAnimating(false);
    }, 1500);
  };

  useEffect(() => {
    if (!isBuilderStateEmpty) {
      triggerPreviewButtonAnimation();
    }
  }, [isBuilderStateEmpty]);

  // If agent is created, the user creating it should be added to the builder
  // editors list. If not, then the user should be in this list.
  useEffect(() => {
    if (isUserError || isUserLoading || !user) {
      return;
    }
    if (agentConfigurationId && initialBuilderState) {
      assert(
        isLegacyAllowed(owner, initialBuilderState.scope) ||
          isAdmin(owner) ||
          initialBuilderState.editors.some((m) => m.sId === user.sId),
        "Unreachable: User is not in editors nor admin"
      );
    }
    if (!agentConfigurationId) {
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
    agentConfigurationId,
    initialBuilderState,
  ]);

  const openRightPanelTab = (tabName: AssistantBuilderRightPanelTab) => {
    setRightPanelStatus({
      tab: tabName,
      openedAt: Date.now(),
    });
  };
  const closeRightPanel = () => {
    setRightPanelStatus({
      tab: null,
      openedAt: null,
    });
  };
  const toggleRightPanel = () => {
    rightPanelStatus.tab !== null
      ? closeRightPanel()
      : openRightPanelTab(template === null ? "Preview" : "Template");
  };

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
    const anyActionError = builderState.actions.some((action) =>
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

  const setAction = useCallback(
    (p: AssistantBuilderSetActionType) => {
      if (p.type === "pending") {
        setPendingAction({ action: p.action, previousActionName: null });
      } else if (p.type === "edit") {
        setPendingAction({
          action: p.action,
          previousActionName: p.action.name,
        });
      } else if (p.type === "clear_pending") {
        setPendingAction({ action: null, previousActionName: null });
      } else if (p.type === "insert") {
        if (builderState.actions.some((a) => a.name === p.action.name)) {
          return;
        }

        setEdited(true);
        setBuilderState((state) => {
          return {
            ...state,
            actions: [...state.actions, p.action],
          };
        });
      }
    },
    [builderState, setBuilderState, setEdited]
  );

  const onAssistantSave = async () => {
    // Redirect to the right screen if there are errors.
    if (instructionsError) {
      setCurrentTab("instructions");
    } else if (hasAnyActionsError) {
      setCurrentTab("actions");
    } else if (assistantHandleError || descriptionError) {
      setCurrentTab("settings");
    } else {
      setDisableUnsavedChangesPrompt(true);
      setIsSavingOrDeleting(true);
      const res = await submitAssistantBuilderForm({
        owner,
        builderState,
        agentConfigurationId,
        slackData: {
          selectedSlackChannels: selectedSlackChannels || [],
          slackChannelsLinkedWithAgent,
        },
        reasoningModels,
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
    Boolean(template !== null && builderState.instructions)
  );

  const modalTitle = agentConfigurationId
    ? `Edit @${builderState.handle}`
    : "New Agent";

  return (
    <>
      <AppContentLayout
        subscription={subscription}
        hideSidebar
        isWideMode
        owner={owner}
        titleChildren={
          !edited ? (
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
          )
        }
      >
        <BuilderLayout
          leftPanel={
            <div className="flex h-full flex-col gap-5 pb-6 pt-4">
              <div className="flex flex-wrap justify-between gap-4 sm:flex-row">
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
                    {!isAgentDiscoveryEnabled && (
                      <div className="flex w-full items-center justify-end">
                        <SharingButton
                          agentConfigurationId={agentConfigurationId}
                          initialScope={
                            initialBuilderState?.scope ?? defaultScope
                          }
                          newScope={builderState.scope}
                          owner={owner}
                          showSlackIntegration={showSlackIntegration}
                          slackChannelSelected={selectedSlackChannels || []}
                          slackDataSource={slackDataSource}
                          setNewScope={(
                            scope: Exclude<AgentConfigurationScope, "global">
                          ) => {
                            setEdited(scope !== initialBuilderState?.scope);
                            setBuilderState((state) => ({ ...state, scope }));
                          }}
                          baseUrl={baseUrl}
                          setNewLinkedSlackChannels={(channels) => {
                            setSelectedSlackChannels(channels);
                            setEdited(true);
                          }}
                        />
                      </div>
                    )}
                  </TabsList>
                </Tabs>
              </div>
              {(() => {
                switch (screen) {
                  case "instructions":
                    return (
                      <InstructionScreen
                        owner={owner}
                        builderState={builderState}
                        setBuilderState={setBuilderState}
                        setEdited={setEdited}
                        resetAt={instructionsResetAt}
                        isUsingTemplate={template !== null}
                        instructionsError={instructionsError}
                        doTypewriterEffect={doTypewriterEffect}
                        setDoTypewriterEffect={setDoTypewriterEffect}
                        agentConfigurationId={agentConfigurationId}
                        models={models}
                        setIsInstructionDiffMode={setIsInstructionDiffMode}
                        isInstructionDiffMode={isInstructionDiffMode}
                      />
                    );
                  case "actions":
                    return (
                      <ActionsScreen
                        owner={owner}
                        builderState={builderState}
                        setBuilderState={setBuilderState}
                        setEdited={setEdited}
                        setAction={setAction}
                        pendingAction={pendingAction}
                        enableReasoningTool={reasoningModels.length > 0}
                        reasoningModels={reasoningModels}
                      />
                    );

                  case "settings":
                    return (
                      <SettingsScreen
                        agentConfigurationId={agentConfigurationId}
                        baseUrl={baseUrl}
                        owner={owner}
                        builderState={builderState}
                        initialHandle={initialBuilderState?.handle}
                        setBuilderState={setBuilderState}
                        setEdited={setEdited}
                        assistantHandleError={assistantHandleError}
                        descriptionError={descriptionError}
                        isAgentDiscoveryEnabled={isAgentDiscoveryEnabled}
                        slackChannelSelected={selectedSlackChannels || []}
                        slackDataSource={slackDataSource}
                        setSelectedSlackChannels={setSelectedSlackChannels}
                        currentUser={user}
                      />
                    );
                  default:
                    assertNever(screen);
                }
              })()}
              <PrevNextButtons screen={screen} setCurrentTab={setCurrentTab} />
            </div>
          }
          buttonsRightPanel={
            <>
              {/* Chevron button */}
              <Button
                size="sm"
                variant="ghost"
                icon={
                  rightPanelStatus.tab !== null
                    ? ChevronRightIcon
                    : ChevronLeftIcon
                }
                disabled={isBuilderStateEmpty}
                onClick={toggleRightPanel}
              />
              {rightPanelStatus.tab === null && (
                <div className="flex flex-col gap-3">
                  {/* Preview Button */}
                  <Button
                    icon={ChatBubbleBottomCenterTextIcon}
                    onClick={() => openRightPanelTab("Preview")}
                    size="sm"
                    variant="outline"
                    tooltip="Preview your agent"
                    className={cn(
                      isPreviewButtonAnimating && "animate-breathing-scale"
                    )}
                    disabled={isBuilderStateEmpty}
                  />
                  {/* Performance Button */}
                  {!!agentConfigurationId && (
                    <Button
                      icon={BarChartIcon}
                      onClick={() => openRightPanelTab("Performance")}
                      size="sm"
                      variant="outline"
                      tooltip="Inspect feedback and performance"
                    />
                  )}
                  {/* Template Button */}
                  {template !== null && (
                    <Button
                      icon={MagicIcon}
                      onClick={() => openRightPanelTab("Template")}
                      size="sm"
                      variant="outline"
                      tooltip="Template instructions"
                    />
                  )}
                </div>
              )}
            </>
          }
          rightPanel={
            <AssistantBuilderRightPanel
              screen={screen}
              template={template}
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
              rightPanelStatus={rightPanelStatus}
              openRightPanelTab={openRightPanelTab}
              builderState={builderState}
              agentConfigurationId={agentConfigurationId}
              setAction={setAction}
              reasoningModels={reasoningModels}
            />
          }
          isRightPanelOpen={rightPanelStatus.tab !== null}
        />
      </AppContentLayout>
    </>
  );
}
