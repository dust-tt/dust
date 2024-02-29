import "react-image-crop/dist/ReactCrop.css";

import {
  Button,
  CircleIcon,
  PlayIcon,
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
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  isBuilder,
} from "@dust-tt/types";
import type * as t from "io-ts";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import React from "react";
import { useSWRConfig } from "swr";

import { SharingButton } from "@app/components/assistant/Sharing";
import { TryAssistantModal } from "@app/components/assistant/TryAssistantModal";
import ActionScreen from "@app/components/assistant_builder/ActionScreen";
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
  AssistantBuilderInitialState,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import AppLayout, { appLayoutBack } from "@app/components/sparkle/AppLayout";
import {
  AppLayoutSimpleCloseTitle,
  AppLayoutSimpleSaveCancelTitle,
} from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useSlackChannelsLinkedWithAgent, useUser } from "@app/lib/swr";

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
    modelSettings: { modelId: "gpt-4", providerId: "openai" },
    temperature: 0.7,
  },
};

const useNavigationLock = (
  isEnabled = true,
  warningText = "You have unsaved changes - are you sure you wish to leave this page?"
) => {
  const router = useRouter();

  useEffect(() => {
    const handleWindowClose = (e: BeforeUnloadEvent) => {
      if (!isEnabled) return;
      e.preventDefault();
      return (e.returnValue = warningText);
    };

    const handleBrowseAway = (url: string) => {
      if (!isEnabled) return;
      if (!window.confirm(warningText)) {
        router.events.emit(
          "routeChangeError",
          new Error("Navigation cancelled by the user"),
          url
        );
        // This is required, otherwise the URL will change.
        history.pushState(null, "", document.location.href);
        // And this is required to actually cancel the navigation.
        throw "Navigation cancelled by the user (this is not an error)";
      }
    };

    // We need both for different browsers.
    window.addEventListener("beforeunload", handleWindowClose);
    router.events.on("routeChangeStart", handleBrowseAway);

    return () => {
      window.removeEventListener("beforeunload", handleWindowClose);
      router.events.off("routeChangeStart", handleBrowseAway);
    };
  }, [isEnabled, warningText, router.events, router.asPath]);
};

const screens = {
  instructions: { label: "Instructions", icon: CircleIcon },
  actions: { label: "Actions & Data sources", icon: SquareIcon },
  naming: { label: "Naming", icon: TriangleIcon },
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
      await submitForm({
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
      await appLayoutBack(owner, router);
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
      Object.entries(screens).map(([key, { label, icon }]) => ({
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
      <TryModalInBuilder
        owner={owner}
        builderState={builderState}
        disabled={!submitEnabled}
      />
      <AppLayout
        subscription={subscription}
        hideSidebar
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
        <div className="flex h-full flex-col gap-5 py-4">
          <div className="flex flex-col justify-between sm:flex-row">
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
        {false && <div className="flex flex-col space-y-8 pb-16 pt-8"></div>}
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

async function submitForm({
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
  if (
    !builderState.handle ||
    !builderState.description ||
    !builderState.instructions ||
    !builderState.avatarUrl
  ) {
    // should be unreachable
    // we keep this for TS
    throw new Error("Form not valid");
  }

  type BodyType = t.TypeOf<
    typeof PostOrPatchAgentConfigurationRequestBodySchema
  >;

  let actionParam: BodyType["assistant"]["action"] | null = null;

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
        name: removeLeadingAt(builderState.handle),
        pictureUrl: builderState.avatarUrl,
        description: builderState.description.trim(),
        status: isDraft ? "draft" : "active",
        scope: builderState.scope,
        action: actionParam,
        generation: {
          prompt: builderState.instructions.trim(),
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

function TryModalInBuilder({
  owner,
  builderState,
  disabled,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  disabled: boolean;
}) {
  const { user } = useUser();
  const [assistant, setAssistant] = useState<
    LightAgentConfigurationType | AgentConfigurationType | null
  >(null);

  async function onTryClick() {
    // A new assistant is created on the fly with status 'draft'
    // so that the user can try it out while creating it.
    setAssistant(
      await submitForm({
        owner,
        builderState: { ...builderState },
        agentConfigurationId: null,
        slackData: {
          selectedSlackChannels: [],
          slackChannelsLinkedWithAgent: [],
        },
        isDraft: true,
      })
    );
  }
  return (
    <>
      {user && assistant && (
        <TryAssistantModal
          owner={owner}
          user={user}
          assistant={assistant}
          onClose={() => {
            setAssistant(null);
          }}
        />
      )}
      <div className="fixed bottom-8 flex w-full justify-center">
        <Button
          label="Try"
          onClick={onTryClick}
          size="md"
          icon={PlayIcon}
          disabled={disabled}
          variant="primary"
        />
      </div>
    </>
  );
}
