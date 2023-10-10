import "react-image-crop/dist/ReactCrop.css";

import {
  Avatar,
  Button,
  Collapsible,
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
import { useCallback, useEffect, useState } from "react";
import React from "react";
import ReactTextareaAutosize from "react-textarea-autosize";
import { mutate } from "swr";

import { AvatarPicker } from "@app/components/assistant_builder/AssistantBuilderAvatarPicker";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import {
  DROID_AVATAR_FILES,
  DROID_AVATARS_BASE_PATH,
  FilteringMode,
} from "@app/components/assistant_builder/shared";
import AppLayout from "@app/components/sparkle/AppLayout";
import {
  AppLayoutSimpleCloseTitle,
  AppLayoutSimpleSaveCancelTitle,
} from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
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
import { TimeframeUnit } from "@app/types/assistant/actions/retrieval";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

import DataSourceResourceSelectorTree from "../DataSourceResourceSelectorTree";

const usedModelConfigs = [
  GPT_4_32K_MODEL_CONFIG,
  GPT_3_5_TURBO_16K_MODEL_CONFIG,
  CLAUDE_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
];

const DATA_SOURCE_MODES = ["GENERIC", "SELECTED"] as const;
type DataSourceMode = (typeof DATA_SOURCE_MODES)[number];
const DATA_SOURCE_MODE_TO_LABEL: Record<DataSourceMode, string> = {
  GENERIC: "None (Generic model)",
  SELECTED: "Selected Data Sources",
};

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

type AssistantBuilderState = {
  dataSourceMode: DataSourceMode;
  dataSourceConfigurations: Record<
    string,
    AssistantBuilderDataSourceConfiguration
  >;
  filteringMode: FilteringMode;
  timeFrame: {
    value: number;
    unit: TimeframeUnit;
  };
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
  dataSourceMode: AssistantBuilderState["dataSourceMode"];
  dataSourceConfigurations:
    | AssistantBuilderState["dataSourceConfigurations"]
    | null;
  filteringMode: FilteringMode | null;
  timeFrame: AssistantBuilderState["timeFrame"] | null;
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
  initialBuilderState: AssistantBuilderInitialState | null;
  agentConfigurationId: string | null;
};

const DEFAULT_ASSISTANT_STATE: AssistantBuilderState = {
  dataSourceMode: "GENERIC",
  dataSourceConfigurations: {},
  filteringMode: "SEARCH",
  timeFrame: {
    value: 1,
    unit: "month",
  },
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
  initialBuilderState,
  agentConfigurationId,
}: AssistantBuilderProps) {
  const router = useRouter();

  const slackDataSource = dataSources.find(
    (ds) => ds.connectorProvider === "slack"
  );

  const [builderState, setBuilderState] = useState<AssistantBuilderState>({
    ...DEFAULT_ASSISTANT_STATE,
    generationSettings: {
      ...DEFAULT_ASSISTANT_STATE.generationSettings,
      modelSettings: owner.plan.limits.largeModels
        ? GPT_4_32K_MODEL_CONFIG
        : GPT_3_5_TURBO_16K_MODEL_CONFIG,
    },
  });
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [dataSourceToManage, setDataSourceToManage] =
    useState<AssistantBuilderDataSourceConfiguration | null>(null);
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
        dataSourceMode: initialBuilderState.dataSourceMode,
        dataSourceConfigurations:
          initialBuilderState.dataSourceConfigurations ?? {
            ...DEFAULT_ASSISTANT_STATE.dataSourceConfigurations,
          },
        filteringMode:
          initialBuilderState.filteringMode ??
          DEFAULT_ASSISTANT_STATE.filteringMode,
        timeFrame: initialBuilderState.timeFrame ?? {
          ...DEFAULT_ASSISTANT_STATE.timeFrame,
        },
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

  // This effect is used to initially set the selectedSlackChannels state using the data retrieved from the API.
  useEffect(() => {
    if (slackChannelsLinkedWithAgent && agentConfigurationId && !edited) {
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
    }
  }, [slackChannelsLinkedWithAgent, agentConfigurationId, edited]);

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

    if (builderState.dataSourceMode === "SELECTED") {
      if (!configuredDataSourceCount) {
        valid = false;
      }
    }

    if (builderState.filteringMode === "TIMEFRAME") {
      if (!builderState.timeFrame.value) {
        valid = false;
        setTimeFrameError("Timeframe must be a number");
      } else {
        setTimeFrameError(null);
      }
    }

    setSubmitEnabled(valid);
  }, [
    builderState.handle,
    builderState.description,
    builderState.instructions,
    builderState.dataSourceMode,
    configuredDataSourceCount,
    builderState.filteringMode,
    builderState.timeFrame.value,
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
    switch (builderState.dataSourceMode) {
      case "GENERIC":
        break;
      case "SELECTED":
        const tfParam = (() => {
          switch (builderState.filteringMode) {
            case "SEARCH":
              return "auto";
            case "TIMEFRAME":
              if (!builderState.timeFrame.value) {
                // unreachable
                // we keep this for TS
                throw new Error("Form not valid");
              }
              return {
                duration: builderState.timeFrame.value,
                unit: builderState.timeFrame.unit,
              };
            default:
              ((x: never) => {
                throw new Error(`Unknown time frame mode ${x}`);
              })(builderState.filteringMode);
          }
        })();

        actionParam = {
          type: "retrieval_configuration",
          query: builderState.filteringMode === "SEARCH" ? "auto" : "none",
          timeframe: tfParam,
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

      default:
        ((x: never) => {
          throw new Error(`Unknown data source mode ${x}`);
        })(builderState.dataSourceMode);
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
      window.alert(`Error deleting Assistant: ${data.error.message}`);
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
              onClose={() => {
                void router.push(`/w/${owner.sId}/builder/assistants`);
              }}
            />
          ) : (
            <AppLayoutSimpleSaveCancelTitle
              title="Edit an Assistant"
              onCancel={() => {
                void router.push(`/w/${owner.sId}/builder/assistants`);
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
                          alert(
                            "An error occured while saving your agent." +
                              " Please try again. If the error persists, pease reach out to team@dust.tt"
                          );
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
          <div className="flex flex-row items-start gap-8">
            <div className="flex flex-col gap-4">
              <div className="text-xl font-bold text-element-900">Name</div>
              <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                Choose a name reflecting the expertise, knowledge access or
                function of your&nbsp;assistant. Mentioning the&nbsp;assistant
                in a conversation, like <span className="italic">"@help"</span>{" "}
                will prompt a&nbsp;response from&nbsp;them.
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
              <div className="text-xl font-bold text-element-900">
                Description
              </div>
              <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                Add a short description that will help Dust and other workspace
                members understand the&nbsp;assistant’s&nbsp;purpose.
              </div>
              <div className="text-sm">
                <Input
                  placeholder="Anwser questions about sales, translate from English to French…"
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
          <div className="mt-8 flex w-full flex-row items-start">
            <div className="flex w-full flex-col gap-4">
              <div className="text-xl font-bold text-element-900">
                Instructions
              </div>
              <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                This is your assistant’s heart and soul.
                <br />
                Describe, as is you were addressing them, their purpose. Be
                specific on the role (
                <span className="italic">I want you to act as&nbsp;…</span>),
                their expected output, and&nbsp;any formatting requirements you
                have (
                <span className="italic">
                  ”Present your&nbsp;answer as&nbsp;a&nbsp;table”
                </span>
                ).
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
                owner={owner}
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
          <div className="flex flex-row items-start">
            <div className="flex flex-col gap-4">
              <div className="text-xl font-bold text-element-900">
                Data Sources
              </div>
              <div className="text-sm text-element-700">
                Aside from common knowledge, your&nbsp;assistant can retrieve
                knowledge from&nbsp;selected sources
                to&nbsp;answer&nbsp;questions. The Data&nbsp;Sources to pick
                from are&nbsp;managed by&nbsp;administrators.
              </div>
              <ul role="list" className="flex flex-row gap-12">
                <li className="flex flex-1">
                  <div className="flex flex-col">
                    <div className="text-sm font-bold text-element-800">
                      Only set data sources if they are necessary.
                    </div>
                    <div className="text-sm text-element-700">
                      By default, the assistant will follow its instructions
                      with common knowledge. It&nbsp;will answer faster when not
                      using Data&nbsp;Sources.
                    </div>
                  </div>
                </li>
                <li className="flex flex-1">
                  <div className="flex flex-col">
                    <div className="text-sm font-bold text-element-800">
                      Select your Data Sources carefully.
                    </div>
                    <div className="text-sm text-element-700">
                      More is not necessarily better. The quality of your
                      assistant’s answers to specific questions will depend on
                      the&nbsp;quality of&nbsp;the&nbsp;underlying&nbsp;data.
                    </div>
                  </div>
                </li>
              </ul>
              <div className="flex flex-row items-center space-x-2 pt-6">
                <div className="text-sm font-semibold text-element-900">
                  Data Sources:
                </div>
                <DropdownMenu>
                  <DropdownMenu.Button>
                    <Button
                      type="select"
                      labelVisible={true}
                      label={
                        DATA_SOURCE_MODE_TO_LABEL[builderState.dataSourceMode]
                      }
                      variant="secondary"
                      hasMagnifying={false}
                      size="sm"
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items origin="bottomRight" width={260}>
                    {Object.entries(DATA_SOURCE_MODE_TO_LABEL).map(
                      ([key, value]) => (
                        <DropdownMenu.Item
                          key={key}
                          label={value}
                          onClick={() => {
                            setEdited(true);
                            setBuilderState((state) => ({
                              ...state,
                              dataSourceMode: key as DataSourceMode,
                            }));
                          }}
                        />
                      )
                    )}
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>
              <div className="pb-4">
                <DataSourceSelectionSection
                  show={builderState.dataSourceMode === "SELECTED"}
                  dataSourceConfigurations={
                    builderState.dataSourceConfigurations
                  }
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
                  filteringMode={builderState.filteringMode}
                  setFilteringMode={(filteringMode: FilteringMode) => {
                    setEdited(true);
                    setBuilderState((state) => ({
                      ...state,
                      filteringMode,
                    }));
                  }}
                  timeFrame={builderState.timeFrame}
                  setTimeFrame={(timeFrame) => {
                    setEdited(true);
                    setBuilderState((state) => ({
                      ...state,
                      timeFrame,
                    }));
                  }}
                  timeFrameError={timeFrameError}
                />
              </div>
              {slackDataSource && (
                <SlackIntegration
                  slackDataSource={slackDataSource}
                  owner={owner}
                  onSave={(channels) => {
                    setEdited(true);
                    setSelectedSlackChannels(channels);
                  }}
                  existingSelection={selectedSlackChannels}
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
}: {
  slackDataSource: DataSourceType;
  owner: WorkspaceType;
  onSave: (channels: { channelId: string; channelName: string }[]) => void;
  existingSelection: { channelId: string; channelName: string }[];
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

  return (
    <>
      <Modal
        isOpen={modalOpen}
        isFullScreen={true}
        hasChanged={hasChanged}
        onClose={closeModal}
        title="Slack bot configuration"
        onSave={save}
      >
        <div className="flex w-full pt-12">
          <div className="mx-auto max-w-6xl pb-8">
            <div className="mb-6">
              <PageHeader
                title={"Select Slack channels"}
                icon={CONNECTOR_CONFIGURATIONS["slack"].logoComponent}
                description="Select the channels in which your assistant will answer by default."
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

      <div className="text-xl font-bold text-element-900">
        Slack Integration
      </div>
      <div className="text-sm text-element-700">
        Assistants can be configured as default for Slack channels.
      </div>
      <div>
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
            label={"Add Slack channels"}
            variant={"primary"}
            icon={PlusIcon}
            onClick={openModal}
          />
        )}
      </div>
      {existingSelection.length ? (
        <>
          <div className="mt-6 text-sm text-element-700">
            Your assistant will answer by default when @dust is mentioned in the
            following channels:
          </div>
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
  owner,
  generationSettings,
  setGenerationSettings,
}: {
  owner: WorkspaceType;
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
              <DropdownMenu.Items origin="topLeft">
                {usedModelConfigs
                  .filter(
                    (modelConfig) =>
                      !modelConfig.largeModel || owner.plan.limits.largeModels
                  )
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
              <DropdownMenu.Items origin="topLeft">
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

function removeLeadingAt(handle: string) {
  return handle.startsWith("@") ? handle.slice(1) : handle;
}
