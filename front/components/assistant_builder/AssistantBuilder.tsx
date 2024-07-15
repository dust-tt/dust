import "react-image-crop/dist/ReactCrop.css";

import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  IconButton,
  MagicIcon,
  Tab,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AssistantBuilderRightPanelStatus,
  AssistantBuilderRightPanelTab,
} from "@dust-tt/types";
import {
  assertNever,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  isBuilder,
  SUPPORTED_MODEL_CONFIGS,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import React from "react";
import { useSWRConfig } from "swr";

import { SharingButton } from "@app/components/assistant/Sharing";
import ActionsScreen, {
  isActionValid,
} from "@app/components/assistant_builder/ActionsScreen";
import AssistantBuilderRightPanel from "@app/components/assistant_builder/AssistantBuilderPreviewDrawer";
import { BuilderLayout } from "@app/components/assistant_builder/BuilderLayout";
import {
  INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
  InstructionScreen,
} from "@app/components/assistant_builder/InstructionScreen";
import NamingScreen, {
  validateHandle,
} from "@app/components/assistant_builder/NamingScreen";
import { PrevNextButtons } from "@app/components/assistant_builder/PrevNextButtons";
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
  getDefaultAssistantState,
} from "@app/components/assistant_builder/types";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import { useSlackChannel } from "@app/components/assistant_builder/useSlackChannels";
import { useTemplate } from "@app/components/assistant_builder/useTemplate";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout, { appLayoutBack } from "@app/components/sparkle/AppLayout";
import {
  AppLayoutSimpleCloseTitle,
  AppLayoutSimpleSaveCancelTitle,
} from "@app/components/sparkle/AppLayoutTitle";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { ClientSideTracking } from "@app/lib/tracking/client";
import { classNames } from "@app/lib/utils";

export default function AssistantBuilder({
  owner,
  subscription,
  plan,
  gaTrackingId,
  dataSources,
  dustApps,
  initialBuilderState,
  agentConfigurationId,
  flow,
  defaultIsEdited,
  baseUrl,
  defaultTemplate,
}: AssistantBuilderProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const sendNotification = React.useContext(SendNotificationsContext);
  const slackDataSource = dataSources.find(
    (ds) => ds.connectorProvider === "slack"
  );
  const defaultScope =
    flow === "workspace_assistants" ? "workspace" : "private";

  const [edited, setEdited] = useState(defaultIsEdited ?? false);
  const [isSavingOrDeleting, setIsSavingOrDeleting] = useState(false);
  const [submitEnabled, setSubmitEnabled] = useState(false);
  const [disableUnsavedChangesPrompt, setDisableUnsavedChangesPrompt] =
    useState(false);
  const [assistantHandleError, setAssistantHandleError] = useState<
    string | null
  >(null);
  const [instructionsError, setInstructionsError] = useState<string | null>(
    null
  );
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
          actions: initialBuilderState.actions,
          maxStepsPerRun:
            initialBuilderState.maxStepsPerRun ??
            getDefaultAssistantState().maxStepsPerRun,
          templateId: initialBuilderState.templateId,
        }
      : {
          ...getDefaultAssistantState(),
          scope: defaultScope,
          generationSettings: {
            ...getDefaultAssistantState().generationSettings,
            modelSettings: !isUpgraded(plan)
              ? GPT_3_5_TURBO_MODEL_CONFIG
              : GPT_4_TURBO_MODEL_CONFIG,
          },
        }
  );

  const [pendingAction, setPendingAction] =
    useState<AssistantBuilderPendingAction>({
      action: null,
    });

  const {
    template,
    instructionsResetAt,
    removeTemplate,
    resetToTemplateInstructions,
    resetToTemplateActions,
  } = useTemplate(defaultTemplate);

  const {
    showSlackIntegration,
    selectedSlackChannels,
    slackChannelsLinkedWithAgent,
    setSelectedSlackChannels,
  } = useSlackChannel({
    dataSources,
    initialChannels: [],
    workspaceId: owner.sId,
    isPrivateAssistant: builderState.scope === "private",
    isBuilder: isBuilder(owner),
    isEdited: edited,
    agentConfigurationId,
  });
  useNavigationLock(edited && !disableUnsavedChangesPrompt);

  const checkUsernameTimeout = React.useRef<NodeJS.Timeout | null>(null);

  const [rightPanelStatus, setRightPanelStatus] =
    useState<AssistantBuilderRightPanelStatus>({
      tab: template != null ? "Template" : null,
      openedAt: template != null ? Date.now() : null,
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
    let valid = true;

    const { handleValid, handleErrorMessage } = await validateHandle({
      owner,
      handle: builderState.handle,
      initialHandle: initialBuilderState?.handle,
      checkUsernameTimeout,
    });
    valid = handleValid;
    setAssistantHandleError(handleErrorMessage);

    if (
      !builderState.description?.trim() ||
      !builderState.instructions?.trim()
    ) {
      valid = false;
    }

    if (
      builderState.instructions &&
      builderState.instructions.length > INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT
    ) {
      setInstructionsError(
        `Instructions must be less than ${INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT} characters.`
      );
      valid = false;
    } else {
      setInstructionsError(null);
    }

    const modelConfig = SUPPORTED_MODEL_CONFIGS.filter(
      (config) =>
        config.modelId === builderState.generationSettings.modelSettings.modelId
    )[0];
    if (!modelConfig) {
      // unreachable
      throw new Error("Model configuration not found");
    }

    if (
      builderState.instructions &&
      builderState.instructions.trim().length / 4 >
        modelConfig.contextSize * 0.9
    ) {
      console.log(
        `csize ${builderState.instructions.trim().length / 4} and limit ${
          modelConfig.contextSize * 0.9
        }`
      );
      setInstructionsError(`Instructions may exceed context size window.`);
      valid = false;
    } else {
      setInstructionsError(null);
    }

    if (!builderState.actions.every((a) => isActionValid(a))) {
      valid = false;
    }

    setSubmitEnabled(valid);
  }, [builderState, owner, initialBuilderState?.handle]);

  useEffect(() => {
    void formValidation();
  }, [formValidation]);

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
        setPendingAction({ action: null });
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
    });

    if (res.isErr()) {
      setIsSavingOrDeleting(false);
      sendNotification({
        title: "Error saving Assistant",
        description: res.error.message,
        type: "error",
      });
    } else {
      await mutate(
        `/api/w/${owner.sId}/data_sources/${slackDataSource?.name}/managed/slack/channels_linked_with_agent`
      );

      // Redirect to the assistant list once saved.
      if (flow === "personal_assistants") {
        await router.push(`/w/${owner.sId}/assistant/new`);
      } else {
        await router.push(`/w/${owner.sId}/builder/assistants`);
      }
    }
  };
  const [screen, setScreen] = useState<BuilderScreen>("instructions");
  const tabs = useMemo(
    () =>
      Object.entries(BUILDER_SCREENS).map(([key, { label, icon }]) => ({
        label,
        current: screen === key,
        onClick: () => {
          setScreen(key as BuilderScreen);
        },
        icon,
      })),
    [screen]
  );

  useEffect(() => {
    void ClientSideTracking.trackAssistantBuilderOpened({
      isNew: !agentConfigurationId,
      templateName: defaultTemplate?.handle,
      assistantName: builderState.handle || undefined,
      workspaceId: owner.sId,
    });
  }, [
    agentConfigurationId,
    builderState.handle,
    defaultTemplate?.handle,
    owner.sId,
  ]);

  useEffect(() => {
    void ClientSideTracking.trackAssistantBuilderStepViewed({
      step: screen,
      isNew: !agentConfigurationId,
      templateName: defaultTemplate?.handle,
      assistantName: builderState.handle || undefined,
      workspaceId: owner.sId,
    });
  }, [
    agentConfigurationId,
    builderState.handle,
    defaultTemplate?.handle,
    owner.sId,
    screen,
  ]);

  const modalTitle = agentConfigurationId
    ? `Edit @${builderState.handle}`
    : "New Assistant";

  return (
    <>
      <AppLayout
        subscription={subscription}
        hideSidebar
        isWideMode
        owner={owner}
        gaTrackingId={gaTrackingId}
        subNavigation={subNavigationBuild({
          owner,
          current: "workspace_assistants",
        })}
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
              onSave={submitEnabled ? onAssistantSave : undefined}
              isSaving={isSavingOrDeleting}
            />
          )
        }
      >
        <BuilderLayout
          leftPanel={
            <div className="flex h-full flex-col gap-5 pb-6 pt-4">
              <div className="flex flex-wrap justify-between gap-4 sm:flex-row">
                <Tab tabs={tabs} variant="stepper" />
                <div className="flex flex-row gap-2 self-end pt-0.5">
                  <SharingButton
                    showSlackIntegration={showSlackIntegration}
                    slackDataSource={slackDataSource || null}
                    owner={owner}
                    agentConfigurationId={agentConfigurationId}
                    initialScope={initialBuilderState?.scope ?? defaultScope}
                    slackChannelSelected={selectedSlackChannels || []}
                    newScope={builderState.scope}
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
              </div>
              {(() => {
                switch (screen) {
                  case "instructions":
                    return (
                      <InstructionScreen
                        owner={owner}
                        plan={plan}
                        builderState={builderState}
                        setBuilderState={setBuilderState}
                        setEdited={setEdited}
                        resetAt={instructionsResetAt}
                        isUsingTemplate={template !== null}
                        instructionsError={instructionsError}
                      />
                    );
                  case "actions":
                    return (
                      <ActionsScreen
                        owner={owner}
                        builderState={builderState}
                        dataSources={dataSources}
                        dustApps={dustApps}
                        setBuilderState={setBuilderState}
                        setEdited={setEdited}
                        setAction={setAction}
                        pendingAction={pendingAction}
                      />
                    );

                  case "naming":
                    return (
                      <NamingScreen
                        owner={owner}
                        builderState={builderState}
                        initialHandle={initialBuilderState?.handle}
                        setBuilderState={setBuilderState}
                        setEdited={setEdited}
                        assistantHandleError={assistantHandleError}
                      />
                    );
                  default:
                    assertNever(screen);
                }
              })()}
              <PrevNextButtons screen={screen} setScreen={setScreen} />
            </div>
          }
          buttonsRightPanel={
            <>
              <IconButton
                size="md"
                variant="tertiary"
                icon={
                  rightPanelStatus.tab !== null
                    ? ChevronRightIcon
                    : ChevronLeftIcon
                }
                onClick={toggleRightPanel}
              />
              {rightPanelStatus.tab === null && template === null && (
                <Button
                  icon={ChatBubbleBottomCenterTextIcon}
                  onClick={() => openRightPanelTab("Preview")}
                  size="md"
                  label={
                    isBuilderStateEmpty
                      ? "Add instructions or tools to Preview"
                      : "Preview"
                  }
                  labelVisible={false}
                  variant="primary"
                  disabled={isBuilderStateEmpty}
                  className={classNames(
                    isPreviewButtonAnimating ? "animate-breathing-scale" : ""
                  )}
                />
              )}
              {rightPanelStatus.tab === null && template !== null && (
                <div className="flex flex-col gap-3 rounded-full border border-structure-200 p-4">
                  <IconButton
                    icon={ChatBubbleBottomCenterTextIcon}
                    onClick={() => openRightPanelTab("Preview")}
                    size="md"
                    variant="tertiary"
                  />
                  <IconButton
                    icon={MagicIcon}
                    onClick={() => openRightPanelTab("Template")}
                    size="md"
                    variant="tertiary"
                  />
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
              setAction={setAction}
            />
          }
          isRightPanelOpen={rightPanelStatus.tab !== null}
        />
      </AppLayout>
    </>
  );
}
