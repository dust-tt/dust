import "react-image-crop/dist/ReactCrop.css";

import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleIcon,
  Dialog,
  IconButton,
  MagicIcon,
  Page,
  SquareIcon,
  Tab,
  TriangleIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AssistantBuilderRightPanelStatus,
  AssistantBuilderRightPanelTab,
  DataSourceType,
  LightAgentConfigurationType,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import type { AppType } from "@dust-tt/types";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
import type { PostOrPatchAgentConfigurationRequestBodySchema } from "@dust-tt/types";
import {
  assertNever,
  getAgentActionConfigurationType,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4O_MODEL_CONFIG,
  isBuilder,
  isDustAppRunConfiguration,
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  removeNulls,
  SUPPORTED_MODEL_CONFIGS,
} from "@dust-tt/types";
import type * as t from "io-ts";
import _ from "lodash";
import { useRouter } from "next/router";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import React from "react";
import { useSWRConfig } from "swr";

import { SharingButton } from "@app/components/assistant/Sharing";
import ActionScreen from "@app/components/assistant_builder/ActionScreen";
import ActionsScreen, {
  isActionValid,
} from "@app/components/assistant_builder/ActionsScreen";
import AssistantBuilderRightPanel from "@app/components/assistant_builder/AssistantBuilderPreviewDrawer";
import {
  InstructionScreen,
  MAX_INSTRUCTIONS_LENGTH,
} from "@app/components/assistant_builder/InstructionScreen";
import NamingScreen, {
  removeLeadingAt,
  validateHandle,
} from "@app/components/assistant_builder/NamingScreen";
import {
  DROID_AVATAR_URLS,
  SPIRIT_AVATAR_URLS,
} from "@app/components/assistant_builder/shared";
import type {
  AssistantBuilderActionType,
  AssistantBuilderInitialState,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import { getDefaultAssistantState } from "@app/components/assistant_builder/types";
import { ConfirmContext } from "@app/components/Confirm";
import AppLayout, { appLayoutBack } from "@app/components/sparkle/AppLayout";
import {
  AppLayoutSimpleCloseTitle,
  AppLayoutSimpleSaveCancelTitle,
} from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useSlackChannelsLinkedWithAgent } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates/[tId]";

type SlackChannel = { slackChannelId: string; slackChannelName: string };
type SlackChannelLinkedWithAgent = SlackChannel & {
  agentConfigurationId: string;
};

export const BUILDER_FLOWS = [
  "workspace_assistants",
  "personal_assistants",
] as const;
export type BuilderFlow = (typeof BUILDER_FLOWS)[number];
type AssistantBuilderProps = {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  gaTrackingId: string;
  dataSources: DataSourceType[];
  dustApps: AppType[];
  initialBuilderState: AssistantBuilderInitialState | null;
  agentConfigurationId: string | null;
  flow: BuilderFlow;
  defaultIsEdited?: boolean;
  baseUrl: string;
  defaultTemplate: FetchAssistantTemplateResponse | null;
  multiActionsAllowed: boolean;
  multiActionsEnabled: boolean;
};

const useNavigationLock = (
  isEnabled = true,
  warningData = {
    title: "Double checking",
    message:
      "You have unsaved changes - are you sure you wish to leave this page?",
    validation: "primaryWarning",
  }
) => {
  const router = useRouter();
  const confirm = useContext(ConfirmContext);
  const isNavigatingAway = React.useRef<boolean>(false);

  useEffect(() => {
    const handleWindowClose = (e: BeforeUnloadEvent) => {
      if (!isEnabled) {
        return;
      }
      e.preventDefault();
      return (e.returnValue = warningData);
    };

    const handleBrowseAway = (url: string) => {
      if (!isEnabled) {
        return;
      }
      if (isNavigatingAway.current) {
        return;
      }

      // Changing the query param is not leaving the page
      const currentRoute = router.asPath.split("?")[0];
      const newRoute = url.split("?")[0];
      if (currentRoute === newRoute) {
        return;
      }

      router.events.emit(
        "routeChangeError",
        new Error("Navigation paused to await confirmation by user"),
        url
      );
      // This is required, otherwise the URL will change.
      history.pushState(null, "", document.location.href);

      void confirm(warningData).then((result) => {
        if (result) {
          isNavigatingAway.current = true;
          void router.push(url);
        }
      });

      // And this is required to actually cancel the navigation.
      throw "Navigation paused to await confirmation by user";
    };

    // We need both for different browsers.
    window.addEventListener("beforeunload", handleWindowClose);
    router.events.on("routeChangeStart", handleBrowseAway);

    return () => {
      window.removeEventListener("beforeunload", handleWindowClose);
      router.events.off("routeChangeStart", handleBrowseAway);
    };
  }, [isEnabled, warningData, router.events, router.asPath, confirm, router]);
};

const screens = {
  instructions: {
    label: "Instructions",
    icon: CircleIcon,
    helpContainer: "instructions-help-container",
  },
  actions: {
    label: "Actions & Data sources",
    icon: SquareIcon,
    helpContainer: "actions-help-container",
  },
  naming: { label: "Naming", icon: TriangleIcon, helpContainer: null },
};
type BuilderScreen = keyof typeof screens;

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
  multiActionsAllowed,
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
        }
      : {
          ...getDefaultAssistantState(),
          scope: defaultScope,
          generationSettings: {
            ...getDefaultAssistantState().generationSettings,
            modelSettings: !isUpgraded(plan)
              ? GPT_3_5_TURBO_MODEL_CONFIG
              : GPT_4O_MODEL_CONFIG,
          },
        }
  );

  const [template, setTemplate] =
    useState<FetchAssistantTemplateResponse | null>(defaultTemplate);

  const [
    showEnableMultiActionsConfirmation,
    setShowEnableMultiActionsConfirmation,
  ] = useState(false);
  const [multiActionsMode, setMultiActionsMode] = useState(multiActionsEnabled);

  const resetTemplate = async () => {
    setTemplate(null);
    await router.replace(
      {
        pathname: router.pathname,
        query: _.omit(router.query, "templateId"),
      },
      undefined,
      { shallow: true }
    );
  };

  const [instructionsResetAt, setInstructionsResetAt] = useState<number | null>(
    null
  );

  const resetToTemplateInstructions = useCallback(async () => {
    if (template === null) {
      return;
    }
    setEdited(true);
    setInstructionsResetAt(Date.now());
    setBuilderState((builderState) => ({
      ...builderState,
      instructions: template.presetInstructions,
    }));
  }, [template]);

  const resetToTemplateActions = useCallback(async () => {
    if (template === null) {
      return;
    }
    const action = getAgentActionConfigurationType(template.presetAction);
    let actionType: AssistantBuilderActionType | null = null;

    if (isRetrievalConfiguration(action)) {
      actionType = "RETRIEVAL_SEARCH";
    } else if (isDustAppRunConfiguration(action)) {
      actionType = "DUST_APP_RUN";
    } else if (isTablesQueryConfiguration(action)) {
      actionType = "TABLES_QUERY";
    } else if (isProcessConfiguration(action)) {
      actionType = "PROCESS";
    }

    if (actionType !== null) {
      const defaultAssistantState = getDefaultAssistantState();

      setEdited(true);
      setBuilderState((builderState) => {
        const newState = {
          ...builderState,
          actions: defaultAssistantState.actions,
        };
        return newState;
      });
    }
  }, [template]);

  const showSlackIntegration =
    builderState.scope === "workspace" || builderState.scope === "published";

  const [edited, setEdited] = useState(defaultIsEdited ?? false);
  const [isSavingOrDeleting, setIsSavingOrDeleting] = useState(false);
  const [submitEnabled, setSubmitEnabled] = useState(false);

  const [assistantHandleError, setAssistantHandleError] = useState<
    string | null
  >(null);

  const [instructionsError, setInstructionsError] = useState<string | null>(
    null
  );

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

  // This state stores the slack channels that should have the current agent as default.
  const [selectedSlackChannels, setSelectedSlackChannels] = useState<
    SlackChannel[] | null
  >(null);

  // Retrieve all the slack channels that are linked with an agent.
  const { slackChannels: slackChannelsLinkedWithAgent } =
    useSlackChannelsLinkedWithAgent({
      workspaceId: owner.sId,
      dataSourceName: slackDataSource?.name ?? undefined,
      disabled: !isBuilder(owner),
    });
  const [slackChannelsInitialized, setSlackChannelsInitialized] =
    useState(false);

  const [disableUnsavedChangesPrompt, setDisableUnsavedChangesPrompt] =
    useState(false);

  useNavigationLock(edited && !disableUnsavedChangesPrompt);

  // This effect is used to initially set the selectedSlackChannels state using the data retrieved from the API.
  useEffect(() => {
    if (
      slackChannelsLinkedWithAgent.length &&
      agentConfigurationId &&
      !edited &&
      !slackChannelsInitialized
    ) {
      setSelectedSlackChannels(
        slackChannelsLinkedWithAgent
          .filter(
            (channel) => channel.agentConfigurationId === agentConfigurationId
          )
          .map((channel) => ({
            slackChannelId: channel.slackChannelId,
            slackChannelName: channel.slackChannelName,
          }))
      );
      setSlackChannelsInitialized(true);
    }
  }, [
    slackChannelsLinkedWithAgent,
    agentConfigurationId,
    edited,
    slackChannelsInitialized,
  ]);

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

    // description
    if (!builderState.description?.trim()) {
      valid = false;
    }

    // instructions
    if (!builderState.instructions?.trim()) {
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
        useMultiActions: multiActionsMode,
      });
      await mutate(
        `/api/w/${owner.sId}/data_sources/${slackDataSource?.name}/managed/slack/channels_linked_with_agent`
      );

      setIsSavingOrDeleting(false);
      // Redirect to the assistant list once saved.
      if (flow === "personal_assistants") {
        await router.push(`/w/${owner.sId}/assistant/assistants`);
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
      Object.entries(screens).map(([key, { label, icon, helpContainer }]) => ({
        label,
        current: screen === key,
        onClick: () => {
          setScreen(key as BuilderScreen);

          if (helpContainer) {
            const element = document.getElementById(helpContainer);
            if (element) {
              element.scrollIntoView({ behavior: "smooth" });
            }
          }
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
      <MultActionsConfirmationModal
        show={showEnableMultiActionsConfirmation}
        onClose={() => setShowEnableMultiActionsConfirmation(false)}
        onConfirm={() => {
          setMultiActionsMode(true);
          setEdited(true);
        }}
      />
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
                  {multiActionsAllowed && (
                    <Button
                      icon={!multiActionsMode ? XMarkIcon : CheckIcon}
                      label={`Multi Actions ${multiActionsMode ? "On" : "Off"}`}
                      onClick={() => {
                        if (!multiActionsMode) {
                          setShowEnableMultiActionsConfirmation(true);
                          return;
                        }
                        setMultiActionsMode(false);
                        setEdited(true);
                      }}
                      variant={!multiActionsMode ? "tertiary" : "primary"}
                    />
                  )}
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
                    if (!multiActionsMode) {
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
              template={template}
              resetTemplate={resetTemplate}
              resetToTemplateInstructions={resetToTemplateInstructions}
              resetToTemplateActions={resetToTemplateActions}
              owner={owner}
              rightPanelStatus={rightPanelStatus}
              openRightPanelTab={openRightPanelTab}
              builderState={builderState}
            />
          }
          isRightPanelOpen={rightPanelStatus.tab !== null}
        />
      </AppLayout>
    </>
  );
}

function PrevNextButtons({
  screen,
  setScreen,
}: {
  screen: BuilderScreen;
  setScreen: (screen: BuilderScreen) => void;
}) {
  return (
    <div className="flex pt-6">
      {screen !== "instructions" && (
        <Button
          label="Previous"
          size="md"
          variant="secondary"
          onClick={() => {
            if (screen === "actions") {
              setScreen("instructions");
            } else if (screen === "naming") {
              setScreen("actions");
            }
          }}
        />
      )}
      <div className="flex-grow" />
      {screen !== "naming" && (
        <Button
          label="Next"
          size="md"
          variant="primary"
          onClick={() => {
            if (screen === "instructions") {
              setScreen("actions");
            } else if (screen === "actions") {
              setScreen("naming");
            }
          }}
        />
      )}
    </div>
  );
}

export async function submitAssistantBuilderForm({
  owner,
  builderState,
  agentConfigurationId,
  slackData,
  isDraft,
  useMultiActions,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  agentConfigurationId: string | null;
  slackData: {
    selectedSlackChannels: SlackChannel[];
    slackChannelsLinkedWithAgent: SlackChannelLinkedWithAgent[];
  };
  isDraft?: boolean;
  useMultiActions: boolean;
}): Promise<LightAgentConfigurationType | AgentConfigurationType> {
  const { selectedSlackChannels, slackChannelsLinkedWithAgent } = slackData;
  let { handle, description, instructions, avatarUrl } = builderState;
  if (!handle || !description || !instructions || !avatarUrl) {
    if (!isDraft) {
      // should be unreachable
      // we keep this for TS
      throw new Error("Form not valid");
    } else {
      handle = handle?.trim() || "Preview";
      description = description?.trim() || "Preview";
      instructions = instructions?.trim() || "Preview";
      avatarUrl = avatarUrl ?? "";
    }
  }

  type BodyType = t.TypeOf<
    typeof PostOrPatchAgentConfigurationRequestBodySchema
  >;

  const actionParams: NonNullable<BodyType["assistant"]["actions"]> =
    removeNulls(
      builderState.actions.map((a) => {
        switch (a.type) {
          case "RETRIEVAL_SEARCH":
          case "RETRIEVAL_EXHAUSTIVE":
            return {
              type: "retrieval_configuration",
              name: a.name,
              description: a.description,
              query: a.type === "RETRIEVAL_SEARCH" ? "auto" : "none",
              relativeTimeFrame:
                a.type === "RETRIEVAL_EXHAUSTIVE"
                  ? {
                      duration: a.configuration.timeFrame.value,
                      unit: a.configuration.timeFrame.unit,
                    }
                  : "auto",
              topK: "auto",
              dataSources: Object.values(
                a.configuration.dataSourceConfigurations
              ).map(({ dataSource, selectedResources, isSelectAll }) => ({
                dataSourceId: dataSource.name,
                workspaceId: owner.sId,
                filter: {
                  parents: !isSelectAll
                    ? {
                        in: selectedResources.map(
                          (resource) => resource.internalId
                        ),
                        not: [],
                      }
                    : null,
                  tags: null,
                },
              })),
            };

          case "DUST_APP_RUN":
            if (!a.configuration.app) {
              return null;
            }
            return {
              type: "dust_app_run_configuration",
              name: a.name,
              description: a.description,
              appWorkspaceId: owner.sId,
              appId: a.configuration.app.sId,
            };

          case "TABLES_QUERY":
            return {
              type: "tables_query_configuration",
              name: a.name,
              description: a.description,
              tables: Object.values(a.configuration),
            };

          case "WEBSEARCH":
            return {
              type: "websearch_configuration",
              name: a.name,
              description: a.description,
            };

          case "PROCESS":
            return {
              type: "process_configuration",
              name: a.name,
              description: a.description,
              dataSources: Object.values(
                a.configuration.dataSourceConfigurations
              ).map(({ dataSource, selectedResources, isSelectAll }) => ({
                dataSourceId: dataSource.name,
                workspaceId: owner.sId,
                filter: {
                  parents: !isSelectAll
                    ? {
                        in: selectedResources.map(
                          (resource) => resource.internalId
                        ),
                        not: [],
                      }
                    : null,
                  tags: null,
                },
              })),
              tagsFilter: a.configuration.tagsFilter,
              relativeTimeFrame: {
                duration: a.configuration.timeFrame.value,
                unit: a.configuration.timeFrame.unit,
              },
              schema: a.configuration.schema,
            };

          default:
            assertNever(a);
        }
      })
    );

  const body: t.TypeOf<typeof PostOrPatchAgentConfigurationRequestBodySchema> =
    {
      assistant: {
        name: removeLeadingAt(handle),
        pictureUrl: avatarUrl,
        description: description,
        instructions: instructions.trim(),
        status: isDraft ? "draft" : "active",
        scope: builderState.scope,
        actions: useMultiActions
          ? actionParams
          : removeNulls([actionParams[0]]),
        model: {
          modelId: builderState.generationSettings.modelSettings.modelId,
          providerId: builderState.generationSettings.modelSettings.providerId,
          temperature: builderState.generationSettings.temperature,
        },
        maxToolsUsePerRun: useMultiActions
          ? builderState.maxToolsUsePerRun ??
            getDefaultAssistantState().maxToolsUsePerRun
          : undefined,
      },
      useMultiActions,
    };

  const res = await fetch(
    !agentConfigurationId
      ? `/api/w/${owner.sId}/assistant/agent_configurations`
      : `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}`,
    {
      method: !agentConfigurationId ? "POST" : "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    throw new Error("An error occurred while saving the configuration.");
  }

  const newAgentConfiguration: {
    agentConfiguration: LightAgentConfigurationType | AgentConfigurationType;
  } = await res.json();
  const agentConfigurationSid = newAgentConfiguration.agentConfiguration.sId;

  // PATCH the linked slack channels if either:
  // - there were already linked channels
  // - there are newly selected channels
  // If the user selected channels that were already routed to a different assistant, the current behavior is to
  // unlink them from the previous assistant and link them to the this one.
  if (
    selectedSlackChannels.length ||
    slackChannelsLinkedWithAgent.filter(
      (channel) => channel.agentConfigurationId === agentConfigurationId
    ).length
  ) {
    const slackLinkRes = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationSid}/linked_slack_channels`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slack_channel_ids: selectedSlackChannels.map(
            ({ slackChannelId }) => slackChannelId
          ),
        }),
      }
    );

    if (!slackLinkRes.ok) {
      throw new Error("An error occurred while linking Slack channels.");
    }
  }

  return newAgentConfiguration.agentConfiguration;
}

export function BuilderLayout({
  leftPanel,
  rightPanel,
  buttonsRightPanel,
  isRightPanelOpen,
}: {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  buttonsRightPanel: React.ReactNode;
  isRightPanelOpen: boolean;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex h-full w-full grow items-center justify-center gap-5 px-5">
        <div className="h-full w-full max-w-[900px] grow">{leftPanel}</div>
        <div className="hidden h-full items-center gap-4 lg:flex">
          {buttonsRightPanel}
          <div
            className={classNames(
              "duration-400 h-full transition-opacity ease-out",
              isRightPanelOpen ? "opacity-100" : "opacity-0"
            )}
          >
            <div
              className={classNames(
                "duration-800 h-full transition-all ease-out",
                isRightPanelOpen ? "w-[440px]" : "w-0"
              )}
            >
              {rightPanel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MultActionsConfirmationModal({
  show,
  onClose,
  onConfirm,
}: {
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      isOpen={show}
      onCancel={() => onClose()}
      onValidate={() => {
        onConfirm();
        onClose();
      }}
      title="Enable Multi Actions"
    >
      <Page.Vertical>
        <div className="flex flex-col gap-y-2">
          <div className="text-md grow font-medium text-warning-600">
            Important
          </div>
          <div className="text-md font-normal text-element-700">
            Multi Actions is an experimental feature that allows an assistant to
            run multiple actions in a single run.
          </div>
          <div className="text-md font-normal text-element-700">
            This feature is still in development and may not work as expected.
            We may break or delete any assistant that uses this feature.
          </div>
        </div>
      </Page.Vertical>
    </Dialog>
  );
}
