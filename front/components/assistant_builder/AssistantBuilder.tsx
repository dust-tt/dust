import "react-image-crop/dist/ReactCrop.css";

import {
  AnthropicLogo,
  Button,
  CircleIcon,
  ContextItem,
  DropdownMenu,
  GoogleLogo,
  MistralLogo,
  Modal,
  OpenaiLogo,
  Page,
  PencilSquareIcon,
  PlayIcon,
  PlusIcon,
  SlackLogo,
  SquareIcon,
  Tab,
  TrashIcon,
  TriangleIcon,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  DataSourceType,
  LightAgentConfigurationType,
  ModelConfig,
  SUPPORTED_MODEL_CONFIGS,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import type { SupportedModel } from "@dust-tt/types";
import type { AppType } from "@dust-tt/types";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
import type { PostOrPatchAgentConfigurationRequestBodySchema } from "@dust-tt/types";
import {
  assertNever,
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  isBuilder,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_NEXT_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
} from "@dust-tt/types";
import type * as t from "io-ts";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import React from "react";
import { useSWRConfig } from "swr";

import { SharingButton } from "@app/components/assistant/Sharing";
import { TryAssistantModal } from "@app/components/assistant/TryAssistantModal";
import ActionScreen from "@app/components/assistant_builder/ActionScreen";
import NamingScreen from "@app/components/assistant_builder/NamingScreen";
import {
  DROID_AVATAR_URLS,
  SPIRIT_AVATAR_URLS,
} from "@app/components/assistant_builder/shared";
import type {
  AssistantBuilderInitialState,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import AppLayout, { appLayoutBack } from "@app/components/sparkle/AppLayout";
import {
  AppLayoutSimpleCloseTitle,
  AppLayoutSimpleSaveCancelTitle,
} from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getSupportedModelConfig } from "@app/lib/assistant";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useSlackChannelsLinkedWithAgent, useUser } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

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

const CREATIVITY_LEVELS = [
  { label: "Deterministic", value: 0 },
  { label: "Factual", value: 0.2 },
  { label: "Balanced", value: 0.7 },
  { label: "Creative", value: 1 },
];
type ModelProvider = (typeof SUPPORTED_MODEL_CONFIGS)[number]["providerId"];
const MODEL_PROVIDER_LOGOS: Record<ModelProvider, ComponentType> = {
  openai: OpenaiLogo,
  anthropic: AnthropicLogo,
  mistral: MistralLogo,
  google_vertex_ai: GoogleLogo,
};

const getCreativityLevelFromTemperature = (temperature: number) => {
  const closest = CREATIVITY_LEVELS.reduce((prev, curr) =>
    Math.abs(curr.value - temperature) < Math.abs(prev.value - temperature)
      ? curr
      : prev
  );
  return closest;
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
    SlackChannel[]
  >([]);

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

  const assistantHandleIsValid = useCallback((handle: string) => {
    return /^[a-zA-Z0-9_-]{1,30}$/.test(removeLeadingAt(handle));
  }, []);

  const assistantHandleIsAvailable = useCallback(
    (handle: string) => {
      if (checkUsernameTimeout.current) {
        clearTimeout(checkUsernameTimeout.current);
      }
      // No check needed if the assistant doesn't change name
      if (handle === initialBuilderState?.handle) return Promise.resolve(true);
      return new Promise((resolve, reject) => {
        checkUsernameTimeout.current = setTimeout(async () => {
          checkUsernameTimeout.current = null;
          const res = await fetch(
            `/api/w/${
              owner.sId
            }/assistant/agent_configurations/name_available?handle=${encodeURIComponent(
              handle
            )}`
          );
          if (!res.ok) {
            return reject(
              new Error("An error occurred while checking the handle.")
            );
          }
          const { available } = await res.json();
          return resolve(available);
        }, 500);
      });
    },
    [owner.sId, initialBuilderState?.handle]
  );

  const configuredDataSourceCount = Object.keys(
    builderState.dataSourceConfigurations
  ).length;

  const formValidation = useCallback(async () => {
    let valid = true;

    if (!builderState.handle || builderState.handle === "@") {
      setAssistantHandleError(null);
      valid = false;
    } else {
      if (!assistantHandleIsValid(builderState.handle)) {
        if (builderState.handle.length > 30) {
          setAssistantHandleError("The name must be 30 characters or less");
        } else {
          setAssistantHandleError("Only letters, numbers, _ and - allowed");
        }
        valid = false;
      } else if (!(await assistantHandleIsAvailable(builderState.handle))) {
        setAssistantHandleError("\u26a0 This handle is already taken");
        valid = false;
      } else {
        setAssistantHandleError(null);
      }
    }

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
    assistantHandleIsAvailable,
    assistantHandleIsValid,
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
          selectedSlackChannels,
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
          console.log("key", key);
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
          <div className="flex flex-row justify-between">
            <Tab tabs={tabs} variant="stepper" />
            <div className="pt-0.5">
              <SharingButton
                owner={owner}
                agentConfigurationId={agentConfigurationId}
                initialScope={initialBuilderState?.scope ?? defaultScope}
                newScope={builderState.scope}
                setNewScope={(
                  scope: Exclude<AgentConfigurationScope, "global">
                ) => {
                  setEdited(scope !== initialBuilderState?.scope);
                  setBuilderState((state) => ({ ...state, scope }));
                }}
                baseUrl={baseUrl}
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

function InstructionScreen({
  owner,
  plan,
  builderState,
  setBuilderState,
  setEdited,
}: {
  owner: WorkspaceType;
  plan: PlanType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    statefn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
}) {
  return (
    <div className="flex h-full max-h-[800px] w-full flex-col gap-4">
      <div className="flex">
        <div className="flex flex-col gap-2">
          <Page.Header title="Instructions" />
          <Page.P>
            <span className="text-sm text-element-700">
              Command or guideline you provide to your assistant to direct its
              responses.
            </span>
          </Page.P>
        </div>
        <div className="flex-grow" />
        <div className="self-end">
          <AdvancedSettings
            owner={owner}
            plan={plan}
            generationSettings={builderState.generationSettings}
            setGenerationSettings={(generationSettings) => {
              setEdited(true);
              setBuilderState((state) => ({
                ...state,
                generationSettings,
              }));
            }}
          />
        </div>
      </div>
      <AssistantBuilderTextArea
        placeholder="I want you to act as…"
        value={builderState.instructions}
        onChange={(value) => {
          setEdited(true);
          setBuilderState((state) => ({
            ...state,
            instructions: value,
          }));
        }}
        error={null}
        name="assistantInstructions"
      />
    </div>
  );
}

function AdvancedSettings({
  owner,
  plan,
  generationSettings,
  setGenerationSettings,
}: {
  owner: WorkspaceType;
  plan: PlanType;
  generationSettings: AssistantBuilderState["generationSettings"];
  setGenerationSettings: (
    generationSettingsSettings: AssistantBuilderState["generationSettings"]
  ) => void;
}) {
  const usedModelConfigs: ModelConfig[] = [
    GPT_4_TURBO_MODEL_CONFIG,
    GPT_3_5_TURBO_MODEL_CONFIG,
    CLAUDE_DEFAULT_MODEL_CONFIG,
    CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
    MISTRAL_MEDIUM_MODEL_CONFIG,
    MISTRAL_SMALL_MODEL_CONFIG,
    GEMINI_PRO_DEFAULT_MODEL_CONFIG,
  ];
  if (owner.flags.includes("mistral_next")) {
    usedModelConfigs.push(MISTRAL_NEXT_MODEL_CONFIG);
  }

  const supportedModelConfig = getSupportedModelConfig(
    generationSettings.modelSettings
  );
  if (!supportedModelConfig) {
    // unreachable
    alert("Unsupported model");
  }
  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button
          label="Advanced settings"
          variant="tertiary"
          size="sm"
          type="select"
        />
      </DropdownMenu.Button>
      <DropdownMenu.Items width={300} overflow="visible">
        <div className="flex flex-col gap-4">
          <div className="flex flex-row items-center gap-2">
            <div className="grow text-sm text-element-900">
              Model selection:
            </div>
            <DropdownMenu>
              <DropdownMenu.Button>
                <Button
                  type="select"
                  labelVisible={true}
                  label={
                    getSupportedModelConfig(generationSettings.modelSettings)
                      .displayName
                  }
                  variant="tertiary"
                  hasMagnifying={false}
                  size="sm"
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items origin="topRight" width={250}>
                <div className="z-[120]">
                  {usedModelConfigs
                    .filter((m) => !(m.largeModel && !isUpgraded(plan)))
                    .map((modelConfig) => (
                      <DropdownMenu.Item
                        key={modelConfig.modelId}
                        icon={MODEL_PROVIDER_LOGOS[modelConfig.providerId]}
                        description={modelConfig.shortDescription}
                        label={modelConfig.displayName}
                        onClick={() => {
                          setGenerationSettings({
                            ...generationSettings,
                            modelSettings: {
                              modelId: modelConfig.modelId,
                              providerId: modelConfig.providerId,
                              // safe because the SupportedModel is derived from the SUPPORTED_MODEL_CONFIGS array
                            } as SupportedModel,
                          });
                        }}
                      />
                    ))}
                </div>
              </DropdownMenu.Items>
            </DropdownMenu>
          </div>
          <div className="flex flex-row items-center gap-2">
            <div className="grow text-sm text-element-900">
              Creativity level:
            </div>
            <DropdownMenu>
              <DropdownMenu.Button>
                <Button
                  type="select"
                  labelVisible={true}
                  label={
                    getCreativityLevelFromTemperature(
                      generationSettings?.temperature
                    ).label
                  }
                  variant="tertiary"
                  hasMagnifying={false}
                  size="sm"
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items origin="topRight">
                {CREATIVITY_LEVELS.map(({ label, value }) => (
                  <DropdownMenu.Item
                    key={label}
                    label={label}
                    onClick={() => {
                      setGenerationSettings({
                        ...generationSettings,
                        temperature: value,
                      });
                    }}
                  />
                ))}
              </DropdownMenu.Items>
            </DropdownMenu>
          </div>
        </div>
      </DropdownMenu.Items>
    </DropdownMenu>
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
                ? { in: Object.keys(selectedResources), not: [] }
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SlackIntegration({
  slackDataSource,
  owner,
  onSave,
  existingSelection,
  assistantHandle,
}: {
  slackDataSource: DataSourceType;
  owner: WorkspaceType;
  onSave: (channels: SlackChannel[]) => void;
  existingSelection: { slackChannelId: string; slackChannelName: string }[];
  assistantHandle?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedChannelTitleById, setSelectedChannelTitleById] = useState<
    Record<string, string>
  >({});
  const [hasChanged, setHasChanged] = useState(false);

  const selectedChannelIds = new Set(Object.keys(selectedChannelTitleById));

  const resetSelection = useCallback(() => {
    setSelectedChannelTitleById(
      existingSelection.reduce(
        (acc, { slackChannelId, slackChannelName }) => ({
          ...acc,
          [slackChannelId]: slackChannelName,
        }),
        {}
      )
    );
  }, [existingSelection]);

  const openModal = () => {
    resetSelection();
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetSelection();
  };

  const save = () => {
    onSave(
      Object.entries(selectedChannelTitleById).map(
        ([slackChannelId, slackChannelName]) => ({
          slackChannelId,
          slackChannelName,
        })
      )
    );

    setModalOpen(false);
  };

  const assistantName = assistantHandle
    ? `@${assistantHandle}`
    : "This assistant";

  return (
    <>
      <Modal
        isOpen={modalOpen}
        variant="full-screen"
        hasChanged={hasChanged}
        onClose={closeModal}
        title="Slack bot configuration"
        onSave={save}
      >
        <Page>
          <Page.Header
            title={"Select Slack channels"}
            icon={CONNECTOR_CONFIGURATIONS["slack"].logoComponent}
            description={`Select the channels in which ${assistantName} will answer by default.`}
          />
          <DataSourceResourceSelectorTree
            owner={owner}
            dataSource={slackDataSource}
            selectedParentIds={selectedChannelIds}
            parentsById={{}}
            onSelectChange={({ resourceId, resourceName }, selected) => {
              setHasChanged(true);

              const newSelectedChannelTitleById = {
                ...selectedChannelTitleById,
              };
              if (selected) {
                newSelectedChannelTitleById[resourceId] = resourceName;
              } else {
                delete newSelectedChannelTitleById[resourceId];
              }

              setSelectedChannelTitleById(newSelectedChannelTitleById);
            }}
            expandable={false}
            fullySelected={false}
            // Write are the channels we're in. Builders can get write but cannot get "none"
            // (reserved to admins).
            filterPermission="write"
          />
        </Page>
      </Modal>

      <div className="text-2xl font-bold text-element-900">
        Slack Integration
      </div>
      <div className="text-sm text-element-700">
        You can set this assistant as the default assistant on a selection of
        your Slack public channels. {assistantName} will answer by default when
        the @Dust Slack bot is mentioned in
        {!existingSelection.length
          ? " these channels."
          : " the channels selected below:"}
      </div>
      <div className="pt-2">
        {existingSelection.length ? (
          <Button
            labelVisible={true}
            label={"Manage channels"}
            variant={"secondary"}
            icon={PencilSquareIcon}
            onClick={openModal}
          />
        ) : (
          <Button
            labelVisible={true}
            label={"Select channels"}
            variant={"secondary"}
            icon={PlusIcon}
            onClick={openModal}
          />
        )}
      </div>
      {existingSelection.length ? (
        <>
          <ContextItem.List className="mt-2 border-b border-t border-structure-200">
            {existingSelection.map(
              ({
                slackChannelId: channelId,
                slackChannelName: channelName,
              }) => {
                return (
                  <ContextItem
                    key={channelId}
                    title={channelName}
                    visual={<ContextItem.Visual visual={SlackLogo} />}
                    action={
                      <Button.List>
                        <Button
                          icon={TrashIcon}
                          variant="secondaryWarning"
                          label="Remove"
                          labelVisible={false}
                          onClick={() => {
                            onSave(
                              existingSelection.filter(
                                (channel) =>
                                  channel.slackChannelId !== channelId
                              )
                            );
                          }}
                        />
                      </Button.List>
                    }
                  />
                );
              }
            )}
          </ContextItem.List>
        </>
      ) : null}
    </>
  );
}

function AssistantBuilderTextArea({
  placeholder,
  value,
  onChange,
  error,
  name,
}: {
  placeholder: string;
  value: string | null;
  onChange: (value: string) => void;
  error?: string | null;
  name: string;
}) {
  return (
    <textarea
      name="name"
      id={name}
      className={classNames(
        "block max-h-full min-h-48 w-full min-w-0 grow rounded-md text-sm text-sm",
        !error
          ? "border-gray-300 focus:border-action-500 focus:ring-action-500"
          : "border-red-500 focus:border-red-500 focus:ring-red-500",
        "bg-structure-50 stroke-structure-50",
        "resize-none"
      )}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => {
        onChange(e.target.value);
      }}
    />
  );
}

function removeLeadingAt(handle: string) {
  return handle.startsWith("@") ? handle.slice(1) : handle;
}
