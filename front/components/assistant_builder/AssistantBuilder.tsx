import "react-image-crop/dist/ReactCrop.css";

import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleIcon,
  SquareIcon,
  Tab,
  TriangleIcon,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
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
  GPT_4_TURBO_MODEL_CONFIG,
  isBuilder,
  isDustAppRunConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  removeNulls,
} from "@dust-tt/types";
import type * as t from "io-ts";
import _ from "lodash";
import { useRouter } from "next/router";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import React from "react";
import { useSWRConfig } from "swr";

import { SharingButton } from "@app/components/assistant/Sharing";
import ActionScreen from "@app/components/assistant_builder/ActionScreen";
import AssistantBuilderPreviewDrawer from "@app/components/assistant_builder/AssistantBuilderPreviewDrawer";
import { InstructionScreen } from "@app/components/assistant_builder/InstructionScreen";
import NamingScreen, {
  removeLeadingAt,
  validateHandle,
} from "@app/components/assistant_builder/NamingScreen";
import {
  DROID_AVATAR_URLS,
  SPIRIT_AVATAR_URLS,
} from "@app/components/assistant_builder/shared";
import type {
  ActionMode,
  AssistantBuilderInitialState,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
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
};

const DEFAULT_ASSISTANT_STATE: AssistantBuilderState = {
  actionMode: "GENERIC",
  dataSourceConfigurations: {},
  timeFrame: {
    value: 1,
    unit: "month",
  },
  dustAppConfiguration: null,
  tablesQueryConfiguration: {},
  handle: null,
  scope: "private",
  description: null,
  instructions: null,
  avatarUrl: null,
  generationSettings: {
    modelSettings: {
      modelId: GPT_4_TURBO_MODEL_CONFIG.modelId,
      providerId: GPT_4_TURBO_MODEL_CONFIG.providerId,
    },
    temperature: 0.7,
  },
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
    label: "Data sources & Actions",
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
          actionMode: initialBuilderState.actionMode,
          dataSourceConfigurations:
            initialBuilderState.dataSourceConfigurations ?? {
              ...DEFAULT_ASSISTANT_STATE.dataSourceConfigurations,
            },
          timeFrame: initialBuilderState.timeFrame ?? {
            ...DEFAULT_ASSISTANT_STATE.timeFrame,
          },
          dustAppConfiguration: initialBuilderState.dustAppConfiguration,
          tablesQueryConfiguration:
            initialBuilderState.tablesQueryConfiguration,
          handle: initialBuilderState.handle,
          description: initialBuilderState.description,
          scope: initialBuilderState.scope,
          instructions: initialBuilderState.instructions,
          avatarUrl: initialBuilderState.avatarUrl,
          generationSettings: initialBuilderState.generationSettings ?? {
            ...DEFAULT_ASSISTANT_STATE.generationSettings,
          },
        }
      : {
          ...DEFAULT_ASSISTANT_STATE,
          scope: defaultScope,
          generationSettings: {
            ...DEFAULT_ASSISTANT_STATE.generationSettings,
            modelSettings: !isUpgraded(plan)
              ? GPT_3_5_TURBO_MODEL_CONFIG
              : GPT_4_TURBO_MODEL_CONFIG,
          },
        }
  );
  const [template, setTemplate] =
    useState<FetchAssistantTemplateResponse | null>(defaultTemplate);
  const resetTemplate = async () => {
    await setTemplate(null);
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
    let actionMode: ActionMode = "GENERIC";

    if (isRetrievalConfiguration(action)) {
      actionMode = "RETRIEVAL_SEARCH";
    } else if (isDustAppRunConfiguration(action)) {
      actionMode = "DUST_APP_RUN";
    } else if (isTablesQueryConfiguration(action)) {
      actionMode = "TABLES_QUERY";
    }

    if (actionMode !== null) {
      setEdited(true);
      setBuilderState((builderState) => ({
        ...builderState,
        actionMode,
        dataSourceConfigurations: {},
        dustAppConfiguration: null,
        tablesQueryConfiguration: {},
      }));
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
  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);

  const checkUsernameTimeout = React.useRef<NodeJS.Timeout | null>(null);

  const [previewDrawerOpenedAt, setPreviewDrawerOpenedAt] = useState<
    number | null
  >(template ? Date.now() : null);

  const openPreviewDrawer = () => {
    setPreviewDrawerOpenedAt(Date.now());
  };
  const closePreviewDrawer = () => {
    setPreviewDrawerOpenedAt(null);
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

  const configuredDataSourceCount = Object.keys(
    builderState.dataSourceConfigurations
  ).length;

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

    if (!builderState.instructions?.trim()) {
      valid = false;
    }

    if (
      builderState.actionMode === "RETRIEVAL_SEARCH" ||
      builderState.actionMode === "RETRIEVAL_EXHAUSTIVE"
    ) {
      if (!configuredDataSourceCount) {
        valid = false;
      }
    }
    if (builderState.actionMode === "RETRIEVAL_EXHAUSTIVE") {
      if (!builderState.timeFrame.value) {
        valid = false;
        setTimeFrameError("Timeframe must be a number");
      } else {
        setTimeFrameError(null);
      }
    }

    if (builderState.actionMode === "DUST_APP_RUN") {
      if (!builderState.dustAppConfiguration) {
        valid = false;
      }
    }

    if (builderState.actionMode === "TABLES_QUERY") {
      if (!builderState.tablesQueryConfiguration) {
        valid = false;
      }
    }

    setSubmitEnabled(valid);
  }, [
    builderState.actionMode,
    builderState.handle,
    builderState.description,
    builderState.instructions,
    configuredDataSourceCount,
    builderState.timeFrame.value,
    builderState.dustAppConfiguration,
    builderState.tablesQueryConfiguration,
    owner,
    initialBuilderState?.handle,
  ]);

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
            <div className="flex min-h-[64vh] flex-col gap-5 pb-16 pt-4">
              <div className="flex flex-col flex-wrap justify-between gap-4 sm:flex-row">
                <Tab tabs={tabs} variant="stepper" />
                <div className="self-end pt-0.5">
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
                      />
                    );
                  case "actions":
                    return (
                      <ActionScreen
                        owner={owner}
                        builderState={builderState}
                        setBuilderState={setBuilderState}
                        setEdited={setEdited}
                        dataSources={dataSources}
                        dustApps={dustApps}
                        timeFrameError={timeFrameError}
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
          rightPanel={
            <AssistantBuilderPreviewDrawer
              template={template}
              resetTemplate={resetTemplate}
              resetToTemplateInstructions={resetToTemplateInstructions}
              resetToTemplateActions={resetToTemplateActions}
              owner={owner}
              previewDrawerOpenedAt={previewDrawerOpenedAt}
              builderState={builderState}
            />
          }
          isRightPanelOpen={previewDrawerOpenedAt !== null}
          toggleRightPanel={
            previewDrawerOpenedAt !== null
              ? closePreviewDrawer
              : openPreviewDrawer
          }
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
    <div className="flex flex-grow pt-6">
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
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  agentConfigurationId: string | null;
  slackData: {
    selectedSlackChannels: SlackChannel[];
    slackChannelsLinkedWithAgent: SlackChannelLinkedWithAgent[];
  };
  isDraft?: boolean;
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

  let actionParam:
    | NonNullable<BodyType["assistant"]["actions"]>[number]
    | null = null;

  switch (builderState.actionMode) {
    case "GENERIC":
      break;
    case "RETRIEVAL_SEARCH":
    case "RETRIEVAL_EXHAUSTIVE":
      actionParam = {
        type: "retrieval_configuration",
        query: builderState.actionMode === "RETRIEVAL_SEARCH" ? "auto" : "none",
        relativeTimeFrame:
          builderState.actionMode === "RETRIEVAL_EXHAUSTIVE"
            ? {
                duration: builderState.timeFrame.value,
                unit: builderState.timeFrame.unit,
              }
            : "auto",
        topK: "auto",
        dataSources: Object.values(builderState.dataSourceConfigurations).map(
          ({ dataSource, selectedResources, isSelectAll }) => ({
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
          })
        ),
      };
      break;

    case "DUST_APP_RUN":
      if (builderState.dustAppConfiguration) {
        actionParam = {
          type: "dust_app_run_configuration",
          appWorkspaceId: owner.sId,
          appId: builderState.dustAppConfiguration.app.sId,
        };
      }
      break;

    case "TABLES_QUERY":
      if (builderState.tablesQueryConfiguration) {
        actionParam = {
          type: "tables_query_configuration",
          tables: Object.values(builderState.tablesQueryConfiguration),
        };
      }
      break;

    default:
      ((x: never) => {
        throw new Error(`Unknown data source mode ${x}`);
      })(builderState.actionMode);
  }

  const body: t.TypeOf<typeof PostOrPatchAgentConfigurationRequestBodySchema> =
    {
      assistant: {
        name: removeLeadingAt(handle),
        pictureUrl: avatarUrl,
        description: description,
        instructions: instructions.trim(),
        status: isDraft ? "draft" : "active",
        scope: builderState.scope,
        actions: removeNulls([actionParam]),
        generation: {
          model: builderState.generationSettings.modelSettings,
          temperature: builderState.generationSettings.temperature,
        },
      },
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
  isRightPanelOpen,
  toggleRightPanel,
}: {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  isRightPanelOpen: boolean;
  toggleRightPanel: () => void;
}) {
  return (
    <>
      <div className="flex px-4 lg:hidden">
        <div className="h-full w-full max-w-[900px]">{leftPanel}</div>
      </div>
      <div className="hidden h-full lg:flex">
        <div className="h-full w-full">
          <div className="flex h-full w-full items-center gap-4 px-5">
            <div className="flex h-full grow justify-center">
              <div className="h-full w-full max-w-[900px]">{leftPanel}</div>
            </div>
            <Button
              label="Preview"
              labelVisible={isRightPanelOpen ? false : true}
              size="md"
              variant={isRightPanelOpen ? "tertiary" : "primary"}
              icon={isRightPanelOpen ? ChevronRightIcon : ChevronLeftIcon}
              onClick={toggleRightPanel}
            />
            <div
              className={classNames(
                "duration-400 s-h-full transition-opacity ease-out",
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
    </>
  );
}
