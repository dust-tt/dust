import {
  Avatar,
  Button,
  DropdownMenu,
  Icon,
  InformationCircleIcon,
  Input,
  PencilSquareIcon,
} from "@dust-tt/sparkle";
import * as t from "io-ts";
import router from "next/router";
import { useCallback, useEffect, useState } from "react";
import ReactTextareaAutosize from "react-textarea-autosize";

import { ConnectorProvider } from "@app/lib/connectors_api";
import { useAgentConfigurations } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { PostOrPatchAgentConfigurationRequestBodySchema } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import { TimeframeUnit } from "@app/types/assistant/actions/retrieval";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

import AppLayout from "../sparkle/AppLayout";
import {
  AppLayoutSimpleCloseTitle,
  AppLayoutSimpleSaveCancelTitle,
} from "../sparkle/AppLayoutTitle";
import { subNavigationAdmin } from "../sparkle/navigation";
import AssistantBuilderDataSourceModal from "./AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "./DataSourceSelectionSection";

const DATA_SOURCE_MODES = ["GENERIC", "SELECTED"] as const;
type DataSourceMode = (typeof DATA_SOURCE_MODES)[number];
const DATA_SOURCE_MODE_TO_LABEL: Record<DataSourceMode, string> = {
  GENERIC: "Generic model (No data source)",
  SELECTED: "Selected data sources",
};

const TIME_FRAME_MODES = ["AUTO", "FORCED"] as const;
type TimeFrameMode = (typeof TIME_FRAME_MODES)[number];

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

type AssistantBuilderState = {
  dataSourceMode: DataSourceMode;
  dataSourceConfigurations: Record<
    string,
    {
      dataSource: DataSourceType;
      selectedResources: Record<string, string>;
    }
  >;
  timeFrameMode: TimeFrameMode;
  timeFrame: {
    value: number;
    unit: TimeframeUnit;
  };
  handle: string | null;
  description: string | null;
  instructions: string | null;
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
  timeFrameMode: TimeFrameMode | null;
  timeFrame: AssistantBuilderState["timeFrame"] | null;
  handle: string;
  description: string;
  instructions: string;
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
  timeFrameMode: "AUTO",
  timeFrame: {
    value: 1,
    unit: "month",
  },
  handle: null,
  description: null,
  instructions: null,
};

export default function AssistantBuilder({
  user,
  owner,
  gaTrackingId,
  dataSources,
  initialBuilderState,
  agentConfigurationId,
}: AssistantBuilderProps) {
  const [builderState, setBuilderState] = useState<AssistantBuilderState>({
    ...DEFAULT_ASSISTANT_STATE,
  });
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [dataSourceToManage, setDataSourceToManage] = useState<{
    dataSource: DataSourceType;
    selectedResources: Record<string, string>;
  } | null>(null);
  const [edited, setEdited] = useState(false);
  const [submitEnabled, setSubmitEnabled] = useState(false);

  const [assistantHandleError, setAssistantHandleError] = useState<
    string | null
  >(null);
  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
  });

  useEffect(() => {
    if (initialBuilderState) {
      setBuilderState({
        dataSourceMode: initialBuilderState.dataSourceMode,
        dataSourceConfigurations:
          initialBuilderState.dataSourceConfigurations ?? {
            ...DEFAULT_ASSISTANT_STATE.dataSourceConfigurations,
          },
        timeFrameMode:
          initialBuilderState.timeFrameMode ??
          DEFAULT_ASSISTANT_STATE.timeFrameMode,
        timeFrame: initialBuilderState.timeFrame ?? {
          ...DEFAULT_ASSISTANT_STATE.timeFrame,
        },
        handle: initialBuilderState.handle,
        description: initialBuilderState.description,
        instructions: initialBuilderState.instructions,
      });
    }
  }, [initialBuilderState]);

  const removeLeadingAt = (handle: string) => {
    return handle.startsWith("@") ? handle.slice(1) : handle;
  };

  const assistantHandleIsValid = useCallback((handle: string) => {
    return /^[a-zA-Z0-9_-]{1,20}$/.test(removeLeadingAt(handle));
  }, []);

  const assistantHandleIsAvailable = useCallback(
    (handle: string) => {
      return !agentConfigurations.some(
        (agentConfiguration) =>
          agentConfiguration.name.toLowerCase() ===
            removeLeadingAt(handle).toLowerCase() &&
          initialBuilderState?.handle !== removeLeadingAt(handle)
      );
    },
    [agentConfigurations, initialBuilderState?.handle]
  );

  const configuredDataSourceCount = Object.keys(
    builderState.dataSourceConfigurations
  ).length;

  const formValidation = useCallback(async () => {
    let valid = true;
    let edited = false;

    if (!builderState.handle || builderState.handle === "@") {
      setAssistantHandleError(null);
      valid = false;
    } else {
      edited = true;
      if (!assistantHandleIsValid(builderState.handle)) {
        setAssistantHandleError("Only letters, numbers, _ and - allowed");
        valid = false;
      } else if (!assistantHandleIsAvailable(builderState.handle)) {
        setAssistantHandleError("Assistant handle is already taken");
        valid = false;
      } else {
        setAssistantHandleError(null);
      }
    }

    if (!builderState.description?.trim()) {
      valid = false;
    } else {
      edited = true;
    }

    if (!builderState.instructions?.trim()) {
      valid = false;
    } else {
      edited = true;
    }

    if (builderState.dataSourceMode === "SELECTED") {
      edited = true;

      if (!configuredDataSourceCount) {
        valid = false;
      }
    }

    if (builderState.timeFrameMode === "FORCED") {
      edited = true;

      if (!builderState.timeFrame.value) {
        valid = false;
        setTimeFrameError("Timeframe must be a number");
      } else {
        setTimeFrameError(null);
      }
    }

    setSubmitEnabled(valid);
    setEdited(edited);
  }, [
    builderState.handle,
    builderState.description,
    builderState.instructions,
    builderState.dataSourceMode,
    configuredDataSourceCount,
    builderState.timeFrameMode,
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
      !builderState.instructions
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
        let tfParam: NonNullable<BodyType["assistant"]["action"]>["timeframe"] =
          "auto";
        if (builderState.timeFrameMode === "FORCED") {
          if (!builderState.timeFrame.value) {
            // unreachable
            // we keep this for TS
            throw new Error("Form not valid");
          }
          tfParam = {
            duration: builderState.timeFrame.value,
            unit: builderState.timeFrame.unit,
          };
        }
        actionParam = {
          type: "retrieval_configuration",
          query: "auto", // TODO ?
          timeframe: tfParam,
          topK: 16, // TODO ?
          dataSources: Object.values(builderState.dataSourceConfigurations).map(
            ({ dataSource, selectedResources }) => ({
              dataSourceId: dataSource.name,
              workspaceId: owner.sId,
              filter: {
                parents: Object.keys(selectedResources).length
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
        pictureUrl: "https://dust.tt/static/droidavatar/Droid_Purple_7.jpg", // TODO
        description: builderState.description.trim(),
        status: "active",
        action: actionParam,
        generation: {
          prompt: builderState.instructions.trim(),
          model: {
            providerId: "openai",
            modelId: "gpt-4",
          },
          temperature: 0.7,
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
      throw new Error("An error occured");
    }

    return res.json();
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
        onSave={({ dataSource, selectedResources }) => {
          setBuilderState((state) => ({
            ...state,
            dataSourceConfigurations: {
              ...state.dataSourceConfigurations,
              [dataSource.name]: {
                dataSource,
                selectedResources,
              },
            },
          }));
        }}
        dataSourceToManage={dataSourceToManage}
      />
      <AppLayout
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
              title="Design your custom Assistant"
              onClose={() => {
                void router.push(`/w/${owner.sId}/builder/assistants`);
              }}
            />
          ) : (
            <AppLayoutSimpleSaveCancelTitle
              title="Design your custom Assistant"
              onCancel={() => {
                void router.push(`/w/${owner.sId}/builder/assistants`);
              }}
              onSave={
                submitEnabled
                  ? () => {
                      submitForm()
                        .then(() => {
                          void router.push(
                            `/w/${owner.sId}/builder/assistants`
                          );
                        })
                        .catch((e) => {
                          console.error(e);
                          alert("An error occured");
                        });
                    }
                  : undefined
              }
            />
          )
        }
      >
        <div className="flex flex-col space-y-8 pt-8">
          <div className="flex flex-row items-start gap-8">
            <div className="flex flex-col gap-4">
              <div className="text-lg font-bold text-element-900">
                Handle / Name
              </div>
              <div className="flex-grow self-stretch text-sm font-normal text-element-800">
                The handle of your assistant will be used to call it with an “@”
                handle (for instance @myAssistant).
              </div>
              <div className="text-sm">
                <Input
                  placeholder="SalesAssistantFrance"
                  value={builderState.handle}
                  onChange={(value) => {
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
              <div className="flex-grow self-stretch text-sm font-normal text-element-800">
                The description helps your collaborators and Dust to understand
                the purpose of the assistant. It must be descriptive and short.
              </div>
              <div className="text-sm">
                <Input
                  placeholder="Assistant designed to answer sales questions"
                  value={builderState.description}
                  onChange={(value) => {
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
                size="lg"
                visual={<img src="/static/droidavatar/Droid_Purple_7.jpg" />}
              />
              <Button
                labelVisible={true}
                label="Change"
                variant="tertiary"
                size="xs"
                icon={PencilSquareIcon}
              />
            </div>
          </div>
          <div className="mt-8 flex w-full flex-row items-start">
            <div className="flex w-full flex-col gap-4">
              <div className="text-lg font-bold text-element-900">
                Instructions
              </div>
              <div className="flex-grow self-stretch text-sm font-normal text-element-800">
                This is the heart and soul of your assistant. Describe, to your
                assistant, its mission and purpose. Be specific on the role, the
                expected output, the type of formatting.{" "}
                <a className="font-bold text-action-500">See examples</a>
              </div>
              <div className="text-sm">
                <AssistantBuilderTextArea
                  placeholder="Achieve a particular task, follow a template, use a certain formating..."
                  value={builderState.instructions}
                  onChange={(value) => {
                    setBuilderState((state) => ({
                      ...state,
                      instructions: value,
                    }));
                  }}
                  error={null}
                  name="assistantInstructions"
                />
              </div>
              <div className="flex flex-row items-center space-x-2">
                <div className="text-sm font-semibold text-action-500">
                  Select a specific LLM model
                </div>
                <Icon size="xs" visual={InformationCircleIcon} />
              </div>
            </div>
          </div>
          <div className="flex flex-row items-start">
            <div className="flex flex-col gap-4">
              <div className="text-lg font-bold text-element-900">
                Data sources
              </div>
              <div className="text-sm text-element-700">
                Customize your Assistant's knowledge !
              </div>
              <ul role="list" className="flex flex-row gap-12">
                <li className="flex flex-1">
                  <div className="flex flex-col">
                    <div className="text-base font-bold text-element-800">
                      Setting data sources is not an obligation.
                    </div>
                    <div className="text-sm text-element-700">
                      By default, your assistant will follow your instructions
                      and answer based on commun knowledge.
                    </div>
                  </div>
                </li>
                <li className="flex flex-1">
                  <div className="flex flex-col">
                    <div className="text-base font-bold text-element-800">
                      Choose your data sources with care.
                    </div>
                    <div className="text-sm text-element-700">
                      The more targeted your data the better the answers will
                      be.
                    </div>
                  </div>
                </li>
              </ul>
              <div className="flex flex-row items-center space-x-2 pt-6">
                <div className="text-sm font-semibold text-element-900">
                  Data source mode:
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
                      size="sm"
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items origin="topRight" width={260}>
                    {Object.entries(DATA_SOURCE_MODE_TO_LABEL).map(
                      ([key, value]) => (
                        <DropdownMenu.Item
                          key={key}
                          label={value}
                          onClick={() => {
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
              <div className="pb-8">
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
                  timeFrameMode={builderState.timeFrameMode}
                  setTimeFrameMode={(timeFrameMode: TimeFrameMode) => {
                    setBuilderState((state) => ({
                      ...state,
                      timeFrameMode,
                    }));
                  }}
                  timeFrame={builderState.timeFrame}
                  setTimeFrame={(timeFrame) => {
                    setBuilderState((state) => ({
                      ...state,
                      timeFrame,
                    }));
                  }}
                  timeFrameError={timeFrameError}
                />
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
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
