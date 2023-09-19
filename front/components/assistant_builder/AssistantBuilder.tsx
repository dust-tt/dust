import {
  Avatar,
  Button,
  DropdownMenu,
  Icon,
  InformationCircleIcon,
  PencilSquareIcon,
} from "@dust-tt/sparkle";
import * as t from "io-ts";
import router from "next/router";
import { useCallback, useEffect, useState } from "react";
import ReactTextareaAutosize from "react-textarea-autosize";

import { ConnectorProvider } from "@app/lib/connectors_api";
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
  dataSourceConfigs: Record<
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
// - allows null dataSourceConfigs
export type AssistantBuilderInitialState = {
  dataSourceMode: AssistantBuilderState["dataSourceMode"];
  dataSourceConfigs: AssistantBuilderState["dataSourceConfigs"] | null;
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
  dataSourceConfigs: {},
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

  useEffect(() => {
    if (initialBuilderState) {
      setBuilderState({
        dataSourceMode: initialBuilderState.dataSourceMode,
        dataSourceConfigs: initialBuilderState.dataSourceConfigs ?? {
          ...DEFAULT_ASSISTANT_STATE.dataSourceConfigs,
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

  const assistantHandleIsValid = (handle: string) => {
    return /^[a-zA-Z0-9_-]{1,20}$/.test(handle);
  };
  const assistantHandleIsAvailable = async (handle: string) => {
    // TODO: check if handle is available
    void handle;
    return true;
  };

  const configuredDataSourceCount = Object.keys(
    builderState.dataSourceConfigs
  ).length;

  const formValidation = useCallback(async () => {
    let valid = true;
    let edited = false;

    if (!builderState.handle) {
      setAssistantHandleError(null);
      valid = false;
    } else {
      edited = true;
      if (!assistantHandleIsValid(builderState.handle)) {
        setAssistantHandleError(
          "Assistant handle must be between 1 and 20 characters long and can only contain letters, numbers, underscores and dashes"
        );
        valid = false;
      } else if (!(await assistantHandleIsAvailable(builderState.handle))) {
        setAssistantHandleError("Assistant handle is already taken");
        valid = false;
      } else {
        setAssistantHandleError(null);
      }
    }

    if (!builderState.description) {
      valid = false;
    } else {
      edited = true;
    }

    if (!builderState.instructions) {
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
  ]);

  useEffect(() => {
    void formValidation();
  }, [formValidation]);

  const configurableDataSources = dataSources.filter(
    (dataSource) => !builderState.dataSourceConfigs[dataSource.name]
  );

  const deleteDataSource = (name: string) => {
    setBuilderState(({ dataSourceConfigs, ...rest }) => {
      const newConfigs = { ...dataSourceConfigs };
      delete newConfigs[name];
      return { ...rest, dataSourceConfigs: newConfigs };
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
          dataSources: Object.values(builderState.dataSourceConfigs).map(
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
        name: builderState.handle,
        pictureUrl: "https://dust.tt/static/droidavatar/Droid_Purple_7.jpg", // TODO
        description: builderState.description,
        status: "active",
        action: actionParam,
        generation: {
          prompt: builderState.instructions,
          model: {
            providerId: "openai",
            modelId: "gpt-4",
          },
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
            dataSourceConfigs: {
              ...state.dataSourceConfigs,
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
          <div className="flex flex-row items-start">
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
            <div className="ml-4 space-y-4">
              <div className="block text-sm font-medium text-element-900">
                Name
              </div>
              <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                The name of your Assistant will be used to call your Assistant
                with an “@” handle (for instance @myAssistant). It must be
                unique.
              </div>
              <AssistantBuilderTextInput
                placeholder="SalesAssistantFrance"
                value={builderState.handle}
                onChange={(value) => {
                  setBuilderState((state) => ({
                    ...state,
                    handle: value,
                  }));
                }}
                error={assistantHandleError}
                name="assistantName"
              />
              <div className="block text-sm font-medium text-element-900">
                Description
              </div>
              <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                The description helps your collaborators and Dust to understand
                the purpose of the Assistant.
              </div>
              <AssistantBuilderTextInput
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
              />
            </div>
          </div>
          <div className="mt-8 flex w-full flex-row items-start">
            <div className="w-full space-y-2">
              <div className="text-lg font-bold text-element-900">
                Instructions
              </div>
              <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non
                diam et dolor aliquet.
              </div>
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
              <div className="flex flex-row items-center space-x-2">
                <div className="text-sm font-semibold text-action-500">
                  Select a specific LLM model
                </div>
                <Icon size="xs" visual={InformationCircleIcon} />
              </div>
            </div>
          </div>
          <div className="flex flex-row items-start">
            <div className="space-y-2">
              <div className="text-lg font-bold text-element-900">
                Data sources
              </div>
              <div className="flex-grow self-stretch text-sm font-bold text-element-900">
                <div className="font-normal text-element-700">
                  Customize your Assistant's knowledge. Tips:
                </div>
                <ul role="list" className="list-disc pl-5 pt-2">
                  <li>
                    Setting data sources is not an obligation.
                    <div className="font-normal text-element-700">
                      By default, your assistant will follow your instructions
                      and answer based on commun knowledge. Only do so if the
                      context is important.
                    </div>
                  </li>
                  <li>
                    Choose your data sources with care.
                    <div className="font-normal text-element-700">
                      The more targeted your data are the better the answers
                      will be.
                    </div>
                  </li>
                </ul>
              </div>
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
                  dataSourceConfigs={builderState.dataSourceConfigs}
                  openDataSourceModal={() => {
                    setShowDataSourcesModal(true);
                  }}
                  canAddDataSource={configurableDataSources.length > 0}
                  onManageDataSource={(name) => {
                    setDataSourceToManage(builderState.dataSourceConfigs[name]);
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

function AssistantBuilderTextInput({
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
    <input
      type="text"
      name="name"
      id={name}
      className={classNames(
        "block w-full min-w-0 rounded-md text-sm",
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
      data-1p-ignore
    />
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
        "block max-h-64 min-h-32 w-full min-w-0 rounded-md text-sm",
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
