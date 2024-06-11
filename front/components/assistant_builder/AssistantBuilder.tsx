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
import ActionScreen from "@app/components/assistant_builder/ActionScreen";
import ActionsScreen, {
  isActionValid,
} from "@app/components/assistant_builder/ActionsScreen";
import AssistantBuilderRightPanel from "@app/components/assistant_builder/AssistantBuilderPreviewDrawer";
import { BuilderLayout } from "@app/components/assistant_builder/BuilderLayout";
import {
  InstructionScreen,
  MAX_INSTRUCTIONS_LENGTH,
} from "@app/components/assistant_builder/InstructionScreen";
import NamingScreen, {
  validateHandle,
} from "@app/components/assistant_builder/NamingScreen";
import { PrevNextButtons } from "@app/components/assistant_builder/PrevNextButtons";
import {
  DROID_AVATAR_URLS,
  SPIRIT_AVATAR_URLS,
} from "@app/components/assistant_builder/shared";
import { submitAssistantBuilderForm } from "@app/components/assistant_builder/submitAssistantBuilderForm";
import type {
  AssistantBuilderProps,
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
import AppLayout, { appLayoutBack } from "@app/components/sparkle/AppLayout";
import {
  AppLayoutSimpleCloseTitle,
  AppLayoutSimpleSaveCancelTitle,
} from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { isUpgraded } from "@app/lib/plans/plan_codes";

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
  multiActionsEnabled,
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
          maxToolsUsePerRun:
            initialBuilderState.maxToolsUsePerRun ??
            getDefaultAssistantState().maxToolsUsePerRun,
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

  useEffect(() => {
    const availableUrls = [...DROID_AVATAR_URLS, ...SPIRIT_AVATAR_URLS];
    // Only set a random avatar if one isn't already set
    if (!builderState.avatarUrl) {
      setBuilderState((state) => ({
        ...state,
        avatarUrl:
          availableUrls[Math.floor(Math.random() * availableUrls.length)],
      }));
    }
  }, [builderState.avatarUrl]);

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
      builderState.instructions.length > MAX_INSTRUCTIONS_LENGTH
    ) {
      setInstructionsError(
        `Instructions must be less than ${MAX_INSTRUCTIONS_LENGTH} characters.`
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

  const onAssistantSave = async () => {
    setDisableUnsavedChangesPrompt(true);
    setIsSavingOrDeleting(true);
    try {
      await submitAssistantBuilderForm({
        owner,
        builderState,
        agentConfigurationId,
        slackData: {
          selectedSlackChannels: selectedSlackChannels || [],
          slackChannelsLinkedWithAgent,
        },
        useMultiActions: multiActionsEnabled,
      });
      await mutate(
        `/api/w/${owner.sId}/data_sources/${slackDataSource?.name}/managed/slack/channels_linked_with_agent`
      );

      // Redirect to the assistant list once saved.
      if (flow === "personal_assistants") {
        await router.push(`/w/${owner.sId}/assistant/new`);
      } else {
        await router.push(`/w/${owner.sId}/builder/assistants`);
      }
    } catch (e) {
      setIsSavingOrDeleting(false);
      sendNotification({
        title: "Error saving Assistant",
        description: `Please try again. If the error persists, reach out to team@dust.tt (error ${
          (e as Error).message
        })`,
        type: "error",
      });
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
        topNavigationCurrent="assistants"
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
                    // TODO(@fontanierh): Remove single actions.
                    if (!multiActionsEnabled) {
                      return (
                        <ActionScreen
                          owner={owner}
                          builderState={builderState}
                          dataSources={dataSources}
                          dustApps={dustApps}
                          setBuilderState={setBuilderState}
                          setEdited={setEdited}
                        />
                      );
                    } else {
                      return (
                        <ActionsScreen
                          owner={owner}
                          builderState={builderState}
                          dataSources={dataSources}
                          dustApps={dustApps}
                          setBuilderState={setBuilderState}
                          setEdited={setEdited}
                        />
                      );
                    }
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
                  label="Preview"
                  labelVisible={false}
                  variant="primary"
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
                resetToTemplateActions(setBuilderState, multiActionsEnabled);
                setEdited(true);
              }}
              owner={owner}
              rightPanelStatus={rightPanelStatus}
              openRightPanelTab={openRightPanelTab}
              builderState={builderState}
              multiActionsMode={multiActionsEnabled}
            />
          }
          isRightPanelOpen={rightPanelStatus.tab !== null}
        />
      </AppLayout>
    </>
  );
}
