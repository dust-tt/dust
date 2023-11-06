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
  PageHeader,
  PencilSquareIcon,
  PlusIcon,
  SlackLogo,
  TrashIcon,
} from "@dust-tt/sparkle";
import * as t from "io-ts";
import { useRouter } from "next/router";
import { ReactNode, useCallback, useEffect, useState } from "react";
import React from "react";
import ReactTextareaAutosize from "react-textarea-autosize";
import { mutate } from "swr";

import { AvatarPicker } from "@app/components/assistant_builder/AssistantBuilderAvatarPicker";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import {
  DROID_AVATAR_FILES,
  DROID_AVATARS_BASE_PATH,
  TIME_FRAME_UNIT_TO_LABEL,
} from "@app/components/assistant_builder/shared";
import AppLayout from "@app/components/sparkle/AppLayout";
import {
  AppLayoutSimpleCloseTitle,
  AppLayoutSimpleSaveCancelTitle,
} from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import {
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  getSupportedModelConfig,
  GPT_3_5_TURBO_16K_MODEL_CONFIG,
  GPT_4_32K_MODEL_CONFIG,
  SupportedModel,
} from "@app/lib/assistant";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { ConnectorProvider } from "@app/lib/connectors_api";
import {
  useAgentConfigurations,
  useSlackChannelsLinkedWithAgent,
} from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { PostOrPatchAgentConfigurationRequestBodySchema } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import { AppType } from "@app/types/app";
import { TimeframeUnit } from "@app/types/assistant/actions/retrieval";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

import DataSourceResourceSelectorTree from "../DataSourceResourceSelectorTree";
import AssistantBuilderDustAppModal from "./AssistantBuilderDustAppModal";
import DustAppSelectionSection from "./DustAppSelectionSection";

const usedModelConfigs = [
  GPT_4_32K_MODEL_CONFIG,
  GPT_3_5_TURBO_16K_MODEL_CONFIG,
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
];

// Actions

const ACTION_MODES = [
  "GENERIC",
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "DUST_APP_RUN",
] as const;
type ActionMode = (typeof ACTION_MODES)[number];
const ACTION_MODE_TO_LABEL: Record<ActionMode, string> = {
  GENERIC: "No action",
  RETRIEVAL_SEARCH: "Search Data Sources",
  RETRIEVAL_EXHAUSTIVE: "Process Data Sources",
  DUST_APP_RUN: "Run Dust App",
};

// Retrieval Action

export const CONNECTOR_PROVIDER_TO_RESOURCE_NAME: Record<
  ConnectorProvider,
  {
    singular: string;
    plural: string;
  }
> = {
  notion: { singular: "page", plural: "pages" },
  google_drive: { singular: "folder", plural: "folders" },
  slack: { singular: "channel", plural: "channels" },
  github: { singular: "repository", plural: "repositories" },
};

export type AssistantBuilderDataSourceConfiguration = {
  dataSource: DataSourceType;
  selectedResources: Record<string, string>;
  isSelectAll: boolean;
};

// DustAppRun Action

export type AssistantBuilderDustAppConfiguration = {
  app: AppType;
};

// Builder State

type AssistantBuilderState = {
  actionMode: ActionMode;
  dataSourceConfigurations: Record<
    string,
    AssistantBuilderDataSourceConfiguration
  >;
  timeFrame: {
    value: number;
    unit: TimeframeUnit;
  };
  dustAppConfiguration: AssistantBuilderDustAppConfiguration | null;
  handle: string | null;
  description: string | null;
  instructions: string | null;
  avatarUrl: string | null;
  generationSettings: {
    modelSettings: SupportedModel;
    temperature: number;
  };
};

// initial state is like the state, but:
// - doesn't allow null handle/description/instructions
// - allows null timeFrame
// - allows null dataSourceConfigurations
export type AssistantBuilderInitialState = {
  actionMode: AssistantBuilderState["actionMode"];
  dataSourceConfigurations:
    | AssistantBuilderState["dataSourceConfigurations"]
    | null;
  timeFrame: AssistantBuilderState["timeFrame"] | null;
  dustAppConfiguration: AssistantBuilderState["dustAppConfiguration"];
  handle: string;
  description: string;
  instructions: string;
  avatarUrl: string;
  generationSettings: {
    modelSettings: SupportedModel;
    temperature: number;
  } | null;
};

type AssistantBuilderProps = {
  user: UserType;
  owner: WorkspaceType;
  gaTrackingId: string;
  dataSources: DataSourceType[];
  dustApps: AppType[];
  initialBuilderState: AssistantBuilderInitialState | null;
  agentConfigurationId: string | null;
};

const DEFAULT_ASSISTANT_STATE: AssistantBuilderState = {
  actionMode: "GENERIC",
  dataSourceConfigurations: {},
  timeFrame: {
    value: 1,
    unit: "month",
  },
  dustAppConfiguration: null,
  handle: null,
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
  user,
  owner,
  gaTrackingId,
  dataSources,
  dustApps,
  initialBuilderState,
  agentConfigurationId,
}: AssistantBuilderProps) {
  const router = useRouter();
  const sendNotification = React.useContext(SendNotificationsContext);
  const slackDataSource = dataSources.find(
    (ds) => ds.connectorProvider === "slack"
  );

  const [builderState, setBuilderState] = useState<AssistantBuilderState>({
    ...DEFAULT_ASSISTANT_STATE,
    generationSettings: {
      ...DEFAULT_ASSISTANT_STATE.generationSettings,
      modelSettings: GPT_4_32K_MODEL_CONFIG,
    },
  });

  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [dataSourceToManage, setDataSourceToManage] =
    useState<AssistantBuilderDataSourceConfiguration | null>(null);

  const [showDustAppsModal, setShowDustAppsModal] = useState(false);

  const [edited, setEdited] = useState(false);
  const [isSavingOrDeleting, setIsSavingOrDeleting] = useState(false);
  const [submitEnabled, setSubmitEnabled] = useState(false);

  const [assistantHandleError, setAssistantHandleError] = useState<
    string | null
  >(null);
  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
  });

  const [avatarUrls, setAvatarUrls] = useState<
    { available: boolean; url: string }[]
  >([]);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  useEffect(() => {
    if (agentConfigurations?.length) {
      const usedAvatarFiles = new Set(
        agentConfigurations
          .map((a) => a.pictureUrl.split(DROID_AVATARS_BASE_PATH)[1])
          .filter(Boolean)
      );
      const availableUrls = DROID_AVATAR_FILES.filter(
        (f) => !usedAvatarFiles.has(f)
      ).map((f) => `https://dust.tt/${DROID_AVATARS_BASE_PATH}${f}`);
      setAvatarUrls(
        DROID_AVATAR_FILES.map((f) => ({
          url: `https://dust.tt/${DROID_AVATARS_BASE_PATH}${f}`,
          available: !usedAvatarFiles.has(f),
        }))
      );
      // Only set a random avatar if one isn't already set
      if (!builderState.avatarUrl) {
        setBuilderState((state) => ({
          ...state,
          avatarUrl:
            availableUrls[Math.floor(Math.random() * availableUrls.length)],
        }));
      }
    }
  }, [
    agentConfigurations?.length,
    agentConfigurations,
    builderState.avatarUrl,
  ]);

  useEffect(() => {
    if (initialBuilderState) {
      setBuilderState({
        actionMode: initialBuilderState.actionMode,
        dataSourceConfigurations:
          initialBuilderState.dataSourceConfigurations ?? {
            ...DEFAULT_ASSISTANT_STATE.dataSourceConfigurations,
          },
        timeFrame: initialBuilderState.timeFrame ?? {
          ...DEFAULT_ASSISTANT_STATE.timeFrame,
        },
        dustAppConfiguration: initialBuilderState.dustAppConfiguration,
        handle: initialBuilderState.handle,
        description: initialBuilderState.description,
        instructions: initialBuilderState.instructions,
        avatarUrl: initialBuilderState.avatarUrl,
        generationSettings: initialBuilderState.generationSettings ?? {
          ...DEFAULT_ASSISTANT_STATE.generationSettings,
        },
      });
    }
  }, [initialBuilderState]);

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
      return !agentConfigurations.some(
        (agentConfiguration) =>
          agentConfiguration.name.toLowerCase() ===
            removeLeadingAt(handle).toLowerCase() &&
          initialBuilderState?.handle.toLowerCase() !==
            removeLeadingAt(handle).toLowerCase()
      );
    },
    [agentConfigurations, initialBuilderState?.handle]
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
      } else if (!assistantHandleIsAvailable(builderState.handle)) {
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

    setSubmitEnabled(valid);
  }, [
    builderState.actionMode,
    builderState.handle,
    builderState.description,
    builderState.instructions,
    configuredDataSourceCount,
    builderState.timeFrame.value,
    builderState.dustAppConfiguration,
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
          timeframe:
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

  const handleDeleteAgent = async () => {
    setIsSavingOrDeleting(true);
    const res = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}`,
      {
        method: "DELETE",
      }
    );

    if (!res.ok) {
      const data = await res.json();
      sendNotification({
        title: "Error deleting Assistant",
        description: data.error.message,
        type: "error",
      });
      setIsSavingOrDeleting(false);
      return;
    }
    await router.push(`/w/${owner.sId}/builder/assistants`);
    setIsSavingOrDeleting(false);
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
        avatarUrls={avatarUrls}
      />
      <AppLayout
        hideSidebar
        user={user}
        owner={owner}
        gaTrackingId={gaTrackingId}
        topNavigationCurrent="settings"
        subNavigation={subNavigationAdmin({
          owner,
          current: "assistants",
        })}
        titleChildren={
          !edited ? (
            <AppLayoutSimpleCloseTitle
              title="Create an assistant"
              onClose={async () => {
                await router.push(`/w/${owner.sId}/builder/assistants`);
              }}
            />
          ) : (
            <AppLayoutSimpleSaveCancelTitle
              title="Edit an Assistant"
              onCancel={async () => {
                await router.push(`/w/${owner.sId}/builder/assistants`);
              }}
              onSave={
                submitEnabled
                  ? () => {
                      setIsSavingOrDeleting(true);
                      submitForm()
                        .then(async () => {
                          await router.push(
                            `/w/${owner.sId}/builder/assistants`
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
        <div className="flex flex-col space-y-8 pb-8 pt-8">
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
            <div className="text-2xl font-bold text-element-900">
              Data Sources & Actions
            </div>
            {configurableDataSources.length === 0 && (
              <ContentMessage title="You don't have any active data source or connection">
                <div className="flex flex-col gap-y-3">
                  <div>
                    Assistants can incorporate existing company data and
                    knowledge to formulate answers.
                  </div>
                  <div>
                    There are two types of knowledge sources:{" "}
                    <strong>Data Sources</strong> (Files you can upload) and{" "}
                    <strong>Connections</strong> (Automatically synchronized
                    with platforms like Notion, Slack, ...).
                  </div>
                  {(() => {
                    switch (owner.role) {
                      case "admin":
                        return (
                          <div>
                            <strong>
                              Visit the "Data Sources" and "Connections"
                              sections in your workspace admin panel to add new
                              sources of knowledge.
                            </strong>
                          </div>
                        );
                      case "builder":
                        return (
                          <div>
                            <strong>
                              Only Admins can activate Connections.
                              <br />
                              You can Data Sources by visiting "Data Source" in
                              your workspace admin panel.
                            </strong>
                          </div>
                        );
                      case "user":
                        return (
                          <div>
                            <strong>
                              Only Admins and Builders can activate Connections
                              and Data Sources.
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
              You can ask the assistant to perform actions before answering,
              like{" "}
              <span className="font-bold text-element-800">
                searching in your Data Sources
              </span>
              , or use a Dust Application you have built for your specific
              needs.
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
                <DropdownMenu.Items origin="bottomRight" width={260}>
                  {Object.entries(ACTION_MODE_TO_LABEL).map(([key, value]) => (
                    <DropdownMenu.Item
                      key={key}
                      label={value}
                      onClick={() => {
                        setEdited(true);
                        setBuilderState((state) => ({
                          ...state,
                          actionMode: key as ActionMode,
                        }));
                      }}
                    />
                  ))}
                </DropdownMenu.Items>
              </DropdownMenu>
            </div>
            <ActionModeSection
              show={builderState.actionMode === "RETRIEVAL_EXHAUSTIVE"}
            >
              <div>
                The assistant will include as many documents as possible from
                the Data Sources, using reverse chronological order.
              </div>
              <div className="grid grid-cols-2 gap-8">
                <div className="col-span-1">
                  <strong>
                    <span className="text-warning-500">Warning!</span>{" "}
                    Assistants are limited in the amount of data they can
                    process.
                  </strong>{" "}
                  Select Data Sources with care, and limit processing to the
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
                The assistant will perform a search on the selected data source,
                run the instructions on the results.{" "}
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
                Your assistant can execute a Dust Application of your design
                before answering. The output of the app (last block) is injeced
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
          </div>

          <div className="flex flex-row items-start">
            <div className="flex flex-col gap-4">
              {slackDataSource && (
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
              <DropdownMenu>
                <DropdownMenu.Button>
                  <Button
                    size="md"
                    variant="primaryWarning"
                    label="Delete this Assistant"
                    icon={TrashIcon}
                  />
                </DropdownMenu.Button>
                <DropdownMenu.Items origin="bottomLeft" width={280}>
                  <div className="flex flex-col gap-y-4 px-4 py-4">
                    <div className="flex flex-col gap-y-2">
                      <div className="grow text-sm font-medium text-element-900">
                        Are you sure you want to delete?
                      </div>

                      <div className="text-sm font-normal text-element-800">
                        This will be permanent and delete the&nbsp;assistant
                        for&nbsp;everyone.
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <Button
                        variant="primaryWarning"
                        size="sm"
                        label="Delete for Everyone"
                        icon={TrashIcon}
                        onClick={handleDeleteAgent}
                      />
                    </div>
                  </div>
                </DropdownMenu.Items>
              </DropdownMenu>
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
        type="full-screen"
        hasChanged={hasChanged}
        onClose={closeModal}
        title="Slack bot configuration"
        onSave={save}
      >
        <div className="pt-12">
          <div className="mx-auto max-w-6xl pb-8">
            <div className="mb-6">
              <PageHeader
                title={"Select Slack channels"}
                icon={CONNECTOR_CONFIGURATIONS["slack"].logoComponent}
                description={`Select the channels in which ${assistantName} will answer by default.`}
              />
            </div>
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
              filterPermission="write"
            />
          </div>
        </div>
      </Modal>

      <div className="text-2xl font-bold text-element-900">
        Slack Integration
      </div>
      <div className="text-sm text-element-700">
        You can set this assistant as the default assistant on a selection of
        your Slack workspace channels. {assistantName} will answer by default
        when the @Dust Slack bot is mentioned in
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
            variant={"primary"}
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
  generationSettings,
  setGenerationSettings,
}: {
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
                {usedModelConfigs.map((modelConfig) => (
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
