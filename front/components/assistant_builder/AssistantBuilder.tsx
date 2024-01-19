import "react-image-crop/dist/ReactCrop.css";

import {
  Avatar,
  Button,
  Collapsible,
  ContentMessage,
  ContextItem,
  DropdownMenu,
  Input,
  Modal,
  Page,
  PencilSquareIcon,
  PlusIcon,
  SlackLogo,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  ConnectorProvider,
  DataSourceType,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import type { SupportedModel } from "@dust-tt/types";
import type { TimeframeUnit } from "@dust-tt/types";
import type { AppType } from "@dust-tt/types";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
import type { PostOrPatchAgentConfigurationRequestBodySchema } from "@dust-tt/types";
import { GEMINI_PRO_DEFAULT_MODEL_CONFIG, isBuilder } from "@dust-tt/types";
import {
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
} from "@dust-tt/types";
import type * as t from "io-ts";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import React from "react";
import ReactTextareaAutosize from "react-textarea-autosize";
import { mutate } from "swr";

import { DeleteAssistantDialog } from "@app/components/assistant/AssistantActions";
import { AvatarPicker } from "@app/components/assistant_builder/AssistantBuilderAvatarPicker";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import AssistantBuilderDustAppModal from "@app/components/assistant_builder/AssistantBuilderDustAppModal";
import AssistantBuilderTablesModal from "@app/components/assistant_builder/AssistantBuilderTablesModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import DustAppSelectionSection from "@app/components/assistant_builder/DustAppSelectionSection";
import {
  DROID_AVATAR_FILES,
  DROID_AVATARS_BASE_PATH,
  SPIRIT_AVATAR_FILES,
  SPIRIT_AVATARS_BASE_PATH,
  TIME_FRAME_UNIT_TO_LABEL,
} from "@app/components/assistant_builder/shared";
import TablesSelectionSection from "@app/components/assistant_builder/TablesSelectionSection";
import { TeamSharingSection } from "@app/components/assistant_builder/TeamSharingSection";
import type {
  ActionMode,
  AssistantBuilderDataSourceConfiguration,
  AssistantBuilderInitialState,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import {
  ADVANCED_ACTION_MODES,
  BASIC_ACTION_MODES,
} from "@app/components/assistant_builder/types";
import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import AppLayout from "@app/components/sparkle/AppLayout";
import {
  AppLayoutSimpleCloseTitle,
  AppLayoutSimpleSaveCancelTitle,
} from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getSupportedModelConfig } from "@app/lib/assistant";
import { tableKey } from "@app/lib/client/tables_query";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { isActivatedStructuredDB } from "@app/lib/development";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import { useSlackChannelsLinkedWithAgent } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

const usedModelConfigs = [
  GPT_4_TURBO_MODEL_CONFIG,
  GPT_3_5_TURBO_MODEL_CONFIG,
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  GEMINI_PRO_DEFAULT_MODEL_CONFIG,
];

// Avatar URLs
const BASE_URL = "https://dust.tt/";
const buildAvatarUrl = (basePath: string, fileName: string) => {
  const url = new URL(BASE_URL);
  url.pathname = `${basePath}${fileName}`;
  return url.toString();
};
const DROID_AVATAR_URLS = DROID_AVATAR_FILES.map((f) =>
  buildAvatarUrl(DROID_AVATARS_BASE_PATH, f)
);
const SPIRIT_AVATAR_URLS = SPIRIT_AVATAR_FILES.map((f) =>
  buildAvatarUrl(SPIRIT_AVATARS_BASE_PATH, f)
);

const ACTION_MODE_TO_LABEL: Record<ActionMode, string> = {
  GENERIC: "No action",
  RETRIEVAL_SEARCH: "Search in data sources",
  RETRIEVAL_EXHAUSTIVE: "Use most recent in data sources",
  DUST_APP_RUN: "Run a Dust app",
  TABLES_QUERY: "Query a set of tables",
};

// Retrieval Action

export const CONNECTOR_PROVIDER_TO_RESOURCE_NAME: Record<
  ConnectorProvider,
  {
    singular: string;
    plural: string;
  }
> = {
  confluence: { singular: "space", plural: "spaces" },
  notion: { singular: "page", plural: "pages" },
  google_drive: { singular: "folder", plural: "folders" },
  slack: { singular: "channel", plural: "channels" },
  github: { singular: "repository", plural: "repositories" },
  intercom: { singular: "article", plural: "articles" },
  webcrawler: { singular: "page", plural: "pages" },
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

const getCreativityLevelFromTemperature = (temperature: number) => {
  const closest = CREATIVITY_LEVELS.reduce((prev, curr) =>
    Math.abs(curr.value - temperature) < Math.abs(prev.value - temperature)
      ? curr
      : prev
  );
  return closest;
};

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
}: AssistantBuilderProps) {
  const router = useRouter();
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

  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [dataSourceToManage, setDataSourceToManage] =
    useState<AssistantBuilderDataSourceConfiguration | null>(null);

  const [showDustAppsModal, setShowDustAppsModal] = useState(false);

  const [showTableModal, setShowTableModal] = useState(false);

  const [edited, setEdited] = useState(defaultIsEdited ?? false);
  const [isSavingOrDeleting, setIsSavingOrDeleting] = useState(false);
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [submitEnabled, setSubmitEnabled] = useState(false);

  const [assistantHandleError, setAssistantHandleError] = useState<
    string | null
  >(null);
  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
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
    {
      channelId: string;
      channelName: string;
    }[]
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
            channelId: channel.slackChannelId,
            channelName: channel.slackChannelName,
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
    return /^[a-zA-Z0-9_-]{1,20}$/.test(removeLeadingAt(handle));
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
        if (builderState.handle.length > 20) {
          setAssistantHandleError("The name must be 20 characters or less");
        } else {
          setAssistantHandleError("Only letters, numbers, _ and - allowed");
        }
        valid = false;
      } else if (!(await assistantHandleIsAvailable(builderState.handle))) {
        setAssistantHandleError("Assistant handle is already taken");
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

  const configurableDataSources = dataSources.filter(
    (dataSource) => !builderState.dataSourceConfigurations[dataSource.name]
  );

  const deleteDataSource = (name: string) => {
    setEdited(true);
    setBuilderState(({ dataSourceConfigurations, ...rest }) => {
      const newConfigs = { ...dataSourceConfigurations };
      delete newConfigs[name];
      return { ...rest, dataSourceConfigurations: newConfigs };
    });
  };

  const deleteDustApp = () => {
    setEdited(true);
    setBuilderState((state) => {
      return { ...state, dustAppConfiguration: null };
    });
  };

  const submitForm = async () => {
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
          query:
            builderState.actionMode === "RETRIEVAL_SEARCH" ? "auto" : "none",
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

    const body: t.TypeOf<
      typeof PostOrPatchAgentConfigurationRequestBodySchema
    > = {
      assistant: {
        name: removeLeadingAt(builderState.handle),
        pictureUrl: builderState.avatarUrl,
        description: builderState.description.trim(),
        status: "active",
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

    const newAgentConfiguration = await res.json();
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
              ({ channelId }) => channelId
            ),
          }),
        }
      );

      if (!slackLinkRes.ok) {
        throw new Error("An error occurred while linking Slack channels.");
      }

      await mutate(
        `/api/w/${owner.sId}/data_sources/${slackDataSource?.name}/managed/slack/channels_linked_with_agent`
      );
    }

    return newAgentConfiguration;
  };

  return (
    <>
      <AssistantBuilderDataSourceModal
        isOpen={showDataSourcesModal}
        setOpen={(isOpen) => {
          setShowDataSourcesModal(isOpen);
          if (!isOpen) {
            setDataSourceToManage(null);
          }
        }}
        owner={owner}
        dataSources={configurableDataSources}
        onSave={({ dataSource, selectedResources, isSelectAll }) => {
          setEdited(true);
          setBuilderState((state) => ({
            ...state,
            dataSourceConfigurations: {
              ...state.dataSourceConfigurations,
              [dataSource.name]: {
                dataSource,
                selectedResources,
                isSelectAll,
              },
            },
          }));
        }}
        dataSourceToManage={dataSourceToManage}
      />
      <AssistantBuilderDustAppModal
        isOpen={showDustAppsModal}
        setOpen={(isOpen) => {
          setShowDustAppsModal(isOpen);
          if (!isOpen) {
            setDataSourceToManage(null);
          }
        }}
        dustApps={dustApps}
        onSave={({ app }) => {
          setEdited(true);
          setBuilderState((state) => ({
            ...state,
            dustAppConfiguration: {
              app,
            },
          }));
        }}
      />
      <AssistantBuilderTablesModal
        isOpen={showTableModal}
        setOpen={(isOpen) => setShowTableModal(isOpen)}
        owner={owner}
        dataSources={dataSources}
        onSave={(t) => {
          setEdited(true);
          setBuilderState((state) => ({
            ...state,
            tablesQueryConfiguration: {
              ...state.tablesQueryConfiguration,
              [tableKey(t)]: t,
            },
          }));
        }}
        tablesQueryConfiguration={builderState.tablesQueryConfiguration}
      />
      <AvatarPicker
        owner={owner}
        isOpen={isAvatarModalOpen}
        setOpen={setIsAvatarModalOpen}
        onPick={(avatarUrl) => {
          setEdited(true);
          setBuilderState((state) => ({
            ...state,
            avatarUrl,
          }));
        }}
        droidAvatarUrls={DROID_AVATAR_URLS}
        spiritAvatarUrls={SPIRIT_AVATAR_URLS}
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
              title="Create an assistant"
              onClose={async () => {
                if (flow === "workspace_assistants")
                  await router.push(`/w/${owner.sId}/builder/assistants`);
                else await router.push(`/w/${owner.sId}/assistant/assistants`);
              }}
            />
          ) : (
            <AppLayoutSimpleSaveCancelTitle
              title="Edit an Assistant"
              onCancel={async () => {
                if (flow === "workspace_assistants")
                  await router.push(`/w/${owner.sId}/builder/assistants`);
                else await router.push(`/w/${owner.sId}/assistant/assistants`);
              }}
              onSave={
                submitEnabled
                  ? () => {
                      setIsSavingOrDeleting(true);
                      submitForm()
                        .then(async () => {
                          if (flow === "workspace_assistants")
                            await router.push(
                              `/w/${owner.sId}/builder/assistants`
                            );
                          else
                            await router.push(
                              `/w/${owner.sId}/assistant/assistants`
                            );
                          setIsSavingOrDeleting(false);
                        })
                        .catch((e) => {
                          console.error(e);
                          sendNotification({
                            title: "Error saving Assistant",
                            description: `Please try again. If the error persists, reach out to team@dust.tt (error ${e.message})`,
                            type: "error",
                          });
                          setIsSavingOrDeleting(false);
                        });
                    }
                  : undefined
              }
              isSaving={isSavingOrDeleting}
            />
          )
        }
      >
        <div className="flex flex-col space-y-8 pb-16 pt-8">
          <div className="flex w-full flex-col gap-4">
            <div className="text-2xl font-bold text-element-900">Identity</div>
            <div className="flex flex-row items-start gap-8">
              <div className="flex flex-col gap-4">
                <div className="text-lg font-bold text-element-900">Name</div>
                <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                  Choose a name reflecting the expertise, knowledge access or
                  function of your&nbsp;assistant. Mentioning the&nbsp;assistant
                  in a conversation, like{" "}
                  <span className="italic">"@help"</span> will prompt
                  a&nbsp;response from&nbsp;them.
                </div>
                <div className="text-sm">
                  <Input
                    placeholder="SalesAssistant, FrenchTranslator, SupportCenter…"
                    value={builderState.handle}
                    onChange={(value) => {
                      setEdited(true);
                      setBuilderState((state) => ({
                        ...state,
                        handle: value.trim(),
                      }));
                    }}
                    error={assistantHandleError}
                    name="assistantName"
                    showErrorLabel
                    className="text-sm"
                  />
                </div>
                <div className="text-lg font-bold text-element-900">
                  Description
                </div>
                <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                  Add a short description that will help Dust and other
                  workspace members understand
                  the&nbsp;assistant’s&nbsp;purpose.
                </div>
                <div className="text-sm">
                  <Input
                    placeholder="Answer questions about sales, translate from English to French…"
                    value={builderState.description}
                    onChange={(value) => {
                      setEdited(true);
                      setBuilderState((state) => ({
                        ...state,
                        description: value,
                      }));
                    }}
                    error={null} // TODO ?
                    name="assistantDescription"
                    className="text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-col items-center space-y-2">
                <Avatar
                  size="xl"
                  visual={<img src={builderState.avatarUrl || ""} />}
                />
                <Button
                  labelVisible={true}
                  label={"Change"}
                  variant="tertiary"
                  size="xs"
                  icon={PencilSquareIcon}
                  onClick={() => {
                    setIsAvatarModalOpen(true);
                  }}
                />
              </div>
            </div>
          </div>
          <TeamSharingSection
            owner={owner}
            agentConfigurationId={agentConfigurationId}
            initialScope={initialBuilderState?.scope ?? defaultScope}
            newScope={builderState.scope}
            setNewScope={(
              scope: Exclude<AgentConfigurationScope, "global">
            ) => {
              setEdited(true);
              setBuilderState((state) => ({ ...state, scope }));
            }}
          />
          <div className="mt-8 flex w-full flex-row items-start">
            <div className="flex w-full flex-col gap-4">
              <div className="text-2xl font-bold text-element-900">
                Instructions
              </div>
              <div className="flex-grow gap-y-4 self-stretch text-sm font-normal text-element-700">
                <p>This is your assistant’s heart and soul.</p>
                <p className="pt-2">
                  Describe, as is you were addressing them, their purpose. Be
                  specific on the role (
                  <span className="italic">I want you to act as&nbsp;…</span>),
                  their expected output, and&nbsp;any formatting requirements
                  you have (
                  <span className="italic">
                    ”Present your&nbsp;answer as&nbsp;a&nbsp;table”
                  </span>
                  ).
                </p>
              </div>
              <div className="text-sm">
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
              <AdvancedSettings
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

          <div className="flex flex-col gap-6 text-sm text-element-700">
            <div className="text-2xl font-bold text-element-900">Action</div>
            {configurableDataSources.length === 0 &&
              Object.keys(builderState.dataSourceConfigurations).length ===
                0 && (
                <ContentMessage title="You don't have any active data source">
                  <div className="flex flex-col gap-y-3">
                    <div>
                      Assistants can incorporate existing company data and
                      knowledge to formulate answers.
                    </div>
                    <div>
                      There are two types of data sources:{" "}
                      <strong>Folders</strong> (Files you can upload) and{" "}
                      <strong>Connections</strong> (Automatically synchronized
                      with platforms like Notion, Slack, ...).
                    </div>
                    {(() => {
                      switch (owner.role) {
                        case "admin":
                          return (
                            <div>
                              <strong>
                                Visit the "Connections" and "Folders" sections
                                in the Assistants panel to add new data sources.
                              </strong>
                            </div>
                          );
                        case "builder":
                          return (
                            <div>
                              <strong>
                                Only Admins can activate Connections.
                                <br />
                                You can add Data Sources by visiting "Folders"
                                in the Assistants panel.
                              </strong>
                            </div>
                          );
                        case "user":
                          return (
                            <div>
                              <strong>
                                Only Admins and Builders can activate
                                Connections or create Folders.
                              </strong>
                            </div>
                          );
                        case "none":
                          return <></>;
                        default:
                          ((x: never) => {
                            throw new Error("Unkonwn role " + x);
                          })(owner.role);
                      }
                    })()}
                  </div>
                </ContentMessage>
              )}
            <div>
              Choose the action the assistant will perform and take into account
              before answering:
            </div>
            <div className="flex flex-row items-center space-x-2">
              <div className="text-sm font-semibold text-element-900">
                Action:
              </div>
              <DropdownMenu>
                <DropdownMenu.Button>
                  <Button
                    type="select"
                    labelVisible={true}
                    label={ACTION_MODE_TO_LABEL[builderState.actionMode]}
                    variant="secondary"
                    hasMagnifying={false}
                    size="sm"
                  />
                </DropdownMenu.Button>
                <DropdownMenu.Items origin="auto" width={200}>
                  {BASIC_ACTION_MODES.map((key) => (
                    <DropdownMenu.Item
                      key={key}
                      label={ACTION_MODE_TO_LABEL[key]}
                      onClick={() => {
                        setEdited(true);
                        setBuilderState((state) => ({
                          ...state,
                          actionMode: key,
                        }));
                      }}
                    />
                  ))}
                  <DropdownMenu.Item
                    label="Advanced actions"
                    hasChildren={true}
                  >
                    <DropdownMenu.Items
                      origin="topLeft"
                      width={250}
                      marginLeft={40}
                    >
                      {ADVANCED_ACTION_MODES.filter((key) => {
                        return (
                          key !== "TABLES_QUERY" ||
                          isActivatedStructuredDB(owner)
                        );
                      }).map((key) => (
                        <DropdownMenu.Item
                          key={key}
                          label={ACTION_MODE_TO_LABEL[key]}
                          onClick={() => {
                            setEdited(true);
                            setBuilderState((state) => ({
                              ...state,
                              actionMode: key,
                            }));
                          }}
                        />
                      ))}
                    </DropdownMenu.Items>
                  </DropdownMenu.Item>
                </DropdownMenu.Items>
              </DropdownMenu>
            </div>
            <ActionModeSection show={builderState.actionMode === "GENERIC"}>
              <div className="text-sm text-element-700">
                No action is set. The assistant will use the instructions only
                to answer.
              </div>
            </ActionModeSection>
            <ActionModeSection
              show={builderState.actionMode === "RETRIEVAL_EXHAUSTIVE"}
            >
              <div>
                The assistant will include as many documents as possible from
                the data sources, using reverse chronological order.
              </div>
              <div className="grid grid-cols-2 gap-8">
                <div className="col-span-1">
                  <strong>
                    <span className="text-warning-500">Warning!</span>{" "}
                    Assistants are limited in the amount of data they can
                    process.
                  </strong>{" "}
                  Select data sources with care, and limit processing to the
                  shortest relevant time frame.
                </div>
                <div className="col-span-1">
                  <strong>Note:</strong> The available data sources are managed
                  by administrators.
                </div>
              </div>
              <DataSourceSelectionSection
                dataSourceConfigurations={builderState.dataSourceConfigurations}
                openDataSourceModal={() => {
                  setShowDataSourcesModal(true);
                }}
                canAddDataSource={configurableDataSources.length > 0}
                onManageDataSource={(name) => {
                  setDataSourceToManage(
                    builderState.dataSourceConfigurations[name]
                  );
                  setShowDataSourcesModal(true);
                }}
                onDelete={deleteDataSource}
              />
              <div className={"flex flex-row items-center gap-4 pb-4"}>
                <div className="text-sm font-semibold text-element-900">
                  Collect data from the last
                </div>
                <input
                  type="text"
                  className={classNames(
                    "h-8 w-16 rounded-md border-gray-300 text-center text-sm",
                    !timeFrameError
                      ? "focus:border-action-500 focus:ring-action-500"
                      : "border-red-500 focus:border-red-500 focus:ring-red-500",
                    "bg-structure-50 stroke-structure-50"
                  )}
                  value={builderState.timeFrame.value || ""}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!isNaN(value) || !e.target.value) {
                      setEdited(true);
                      setBuilderState((state) => ({
                        ...state,
                        timeFrame: {
                          value,
                          unit: builderState.timeFrame.unit,
                        },
                      }));
                    }
                  }}
                />
                <DropdownMenu>
                  <DropdownMenu.Button tooltipPosition="above">
                    <Button
                      type="select"
                      labelVisible={true}
                      label={
                        TIME_FRAME_UNIT_TO_LABEL[builderState.timeFrame.unit]
                      }
                      variant="secondary"
                      size="sm"
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items origin="bottomLeft">
                    {Object.entries(TIME_FRAME_UNIT_TO_LABEL).map(
                      ([key, value]) => (
                        <DropdownMenu.Item
                          key={key}
                          label={value}
                          onClick={() => {
                            setEdited(true);
                            setBuilderState((state) => ({
                              ...state,
                              timeFrame: {
                                value: builderState.timeFrame.value,
                                unit: key as TimeframeUnit,
                              },
                            }));
                          }}
                        />
                      )
                    )}
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>
            </ActionModeSection>
            <ActionModeSection
              show={builderState.actionMode === "RETRIEVAL_SEARCH"}
            >
              <div>
                The assistant will perform a search on the selected data
                sources, and run the instructions on the results.{" "}
                <span className="font-semibold">
                  It’s the best approach with large quantities of data.
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p>
                    <strong>Select your sources with care</strong> The quality
                    of the answers to specific questions will depend on the
                    quality of the data.
                  </p>
                  <p className="mt-1">
                    <strong>
                      You can narrow your search on most recent documents
                    </strong>{" "}
                    by adding instructions in your prompt such as 'Only search
                    in documents from the last 3 months', 'Only look at data
                    from the last 2 days', etc.
                  </p>
                </div>
                <div>
                  <p>
                    <strong>Note:</strong> The available data sources are
                    managed by administrators.
                  </p>
                </div>
              </div>

              <DataSourceSelectionSection
                dataSourceConfigurations={builderState.dataSourceConfigurations}
                openDataSourceModal={() => {
                  setShowDataSourcesModal(true);
                }}
                canAddDataSource={configurableDataSources.length > 0}
                onManageDataSource={(name) => {
                  setDataSourceToManage(
                    builderState.dataSourceConfigurations[name]
                  );
                  setShowDataSourcesModal(true);
                }}
                onDelete={deleteDataSource}
              />
            </ActionModeSection>
            <ActionModeSection
              show={builderState.actionMode === "DUST_APP_RUN"}
            >
              <div className="text-sm text-element-700">
                The assistant will execute a Dust Application of your design
                before answering. The output of the app (last block) is injected
                in context for the model to generate an answer. The inputs of
                the app will be automatically generated from the context of the
                conversation based on the descriptions you provided in the
                application's input block dataset schema.
              </div>
              <DustAppSelectionSection
                show={builderState.actionMode === "DUST_APP_RUN"}
                dustAppConfiguration={builderState.dustAppConfiguration}
                openDustAppModal={() => {
                  setShowDustAppsModal(true);
                }}
                onDelete={deleteDustApp}
                canSelectDustApp={dustApps.length !== 0}
              />
            </ActionModeSection>
            <ActionModeSection
              show={builderState.actionMode === "TABLES_QUERY"}
            >
              <div className="text-sm text-element-700">
                The assistant will generate a SQL query from your request,
                execute it on the tables selected and use the results to
                generate an answer.
              </div>
              <TablesSelectionSection
                show={builderState.actionMode === "TABLES_QUERY"}
                tablesQueryConfiguration={builderState.tablesQueryConfiguration}
                openTableModal={() => {
                  setShowTableModal(true);
                }}
                onDelete={(key) => {
                  setEdited(true);
                  setBuilderState((state) => {
                    const tablesQueryConfiguration =
                      state.tablesQueryConfiguration;
                    delete tablesQueryConfiguration[key];
                    return {
                      ...state,
                      tablesQueryConfiguration,
                    };
                  });
                }}
                canSelectTable={dataSources.length !== 0}
              />
            </ActionModeSection>
          </div>

          <div className="flex flex-row items-start">
            <div className="flex flex-col gap-4">
              {slackDataSource &&
                isBuilder(owner) &&
                builderState.scope !== "private" &&
                initialBuilderState?.scope !== "private" && (
                  <SlackIntegration
                    slackDataSource={slackDataSource}
                    owner={owner}
                    onSave={(channels) => {
                      setEdited(true);
                      setSelectedSlackChannels(channels);
                    }}
                    existingSelection={selectedSlackChannels}
                    assistantHandle={builderState.handle ?? undefined}
                  />
                )}
            </div>
          </div>

          {agentConfigurationId && (
            <div className="flex w-full justify-center pt-8">
              <DeleteAssistantDialog
                owner={owner}
                agentConfigurationId={agentConfigurationId}
                show={showDeletionModal}
                onClose={() => setShowDeletionModal(false)}
                onDelete={async () => {
                  setShowDeletionModal(false);
                  await router.push(`/w/${owner.sId}/builder/assistants`);
                }}
              />
              <Button
                size="md"
                variant="primaryWarning"
                label="Delete this Assistant"
                icon={TrashIcon}
                onClick={() => {
                  setShowDeletionModal(true);
                }}
              />
            </div>
          )}
        </div>
      </AppLayout>
    </>
  );
}

function SlackIntegration({
  slackDataSource,
  owner,
  onSave,
  existingSelection,
  assistantHandle,
}: {
  slackDataSource: DataSourceType;
  owner: WorkspaceType;
  onSave: (channels: { channelId: string; channelName: string }[]) => void;
  existingSelection: { channelId: string; channelName: string }[];
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
        (acc, { channelId, channelName }) => ({
          ...acc,
          [channelId]: channelName,
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
        ([channelId, channelName]) => ({
          channelId,
          channelName,
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
            {existingSelection.map(({ channelId, channelName }) => {
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
                              (channel) => channel.channelId !== channelId
                            )
                          );
                        }}
                      />
                    </Button.List>
                  }
                />
              );
            })}
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
    <ReactTextareaAutosize
      name="name"
      id={name}
      className={classNames(
        "block max-h-64 min-h-48 w-full min-w-0 rounded-md text-sm",
        !error
          ? "border-gray-300 focus:border-action-500 focus:ring-action-500"
          : "border-red-500 focus:border-red-500 focus:ring-red-500",
        "bg-structure-50 stroke-structure-50"
      )}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => {
        onChange(e.target.value);
      }}
    />
  );
}

function AdvancedSettings({
  plan,
  generationSettings,
  setGenerationSettings,
}: {
  plan: PlanType;
  generationSettings: AssistantBuilderState["generationSettings"];
  setGenerationSettings: (
    generationSettingsSettings: AssistantBuilderState["generationSettings"]
  ) => void;
}) {
  const supportedModelConfig = getSupportedModelConfig(
    generationSettings.modelSettings
  );
  if (!supportedModelConfig) {
    // unreachable
    alert("Unsupported model");
  }
  return (
    <Collapsible>
      <Collapsible.Button label="Advanced settings" />
      <Collapsible.Panel>
        <div className="flex flex-row items-center gap-12">
          <div className="flex flex-1 flex-row items-center gap-2">
            <div className="text-sm font-semibold text-element-900">
              Underlying model:
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
                  variant="secondary"
                  hasMagnifying={false}
                  size="sm"
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items origin="bottomRight">
                {usedModelConfigs
                  .filter((m) => !(m.largeModel && !isUpgraded(plan)))
                  .map((modelConfig) => (
                    <DropdownMenu.Item
                      key={modelConfig.modelId}
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
              </DropdownMenu.Items>
            </DropdownMenu>
          </div>
          <div className="flex flex-1 flex-row items-center gap-2">
            <div className="text-sm font-semibold text-element-900">
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
                  variant="secondary"
                  hasMagnifying={false}
                  size="sm"
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items origin="bottomRight">
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
      </Collapsible.Panel>
    </Collapsible>
  );
}

function ActionModeSection({
  children,
  show,
}: {
  children: ReactNode;
  show: boolean;
}) {
  return show && <div className="flex flex-col gap-6">{children}</div>;
}
function removeLeadingAt(handle: string) {
  return handle.startsWith("@") ? handle.slice(1) : handle;
}
