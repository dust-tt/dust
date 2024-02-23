import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  CommandLineIcon,
  ContentMessage,
  DropdownMenu,
  MagnifyingGlassIcon,
  Page,
  Square3Stack3DIcon,
  TableIcon,
  TimeIcon,
} from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import type { AppType, TimeframeUnit } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import AssistantBuilderDustAppModal from "@app/components/assistant_builder/AssistantBuilderDustAppModal";
import AssistantBuilderTablesModal from "@app/components/assistant_builder/AssistantBuilderTablesModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import DustAppSelectionSection from "@app/components/assistant_builder/DustAppSelectionSection";
import { TIME_FRAME_UNIT_TO_LABEL } from "@app/components/assistant_builder/shared";
import TablesSelectionSection from "@app/components/assistant_builder/TablesSelectionSection";
import type {
  ActionMode,
  AssistantBuilderDataSourceConfiguration,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import { ACTION_MODES } from "@app/components/assistant_builder/types";
import { tableKey } from "@app/lib/client/tables_query";
import { classNames } from "@app/lib/utils";

const BASIC_ACTION_TYPES = ["REPLY_ONLY", "USE_DATA_SOURCES"] as const;
const ADVANCED_ACTION_TYPES = ["RUN_DUST_APP"] as const;

type ActionType =
  | (typeof BASIC_ACTION_TYPES)[number]
  | (typeof ADVANCED_ACTION_TYPES)[number];

const SEARCH_MODES = [
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "TABLES_QUERY",
] as const;
type SearchMode = (typeof SEARCH_MODES)[number];

const ACTION_TYPE_TO_LABEL: Record<ActionType, string> = {
  REPLY_ONLY: "Reply only",
  USE_DATA_SOURCES: "Use Data sources",
  RUN_DUST_APP: "Run a Dust app",
};

const ACTION_TYPE_TO_DESCRIPTION: Record<ActionType, string> = {
  REPLY_ONLY: "Direct answer from the model",
  USE_DATA_SOURCES: "Use Data sources to reply",
  RUN_DUST_APP: "Run a Dust app, then reply",
};

const ACTION_TYPE_TO_ICON: Record<ActionType, ComponentType> = {
  REPLY_ONLY: ChatBubbleBottomCenterTextIcon,
  USE_DATA_SOURCES: Square3Stack3DIcon,
  RUN_DUST_APP: CommandLineIcon,
};

const DEFAULT_ACTION_MODE_FOR_ACTION_TYPE: Record<ActionType, ActionMode> = {
  REPLY_ONLY: "GENERIC",
  USE_DATA_SOURCES: "RETRIEVAL_SEARCH",
  RUN_DUST_APP: "DUST_APP_RUN",
};

const SEARCH_MODE_TO_LABEL: Record<SearchMode, string> = {
  RETRIEVAL_SEARCH: "Search",
  RETRIEVAL_EXHAUSTIVE: "Most recent data",
  TABLES_QUERY: "Query Tables",
};

const SEARCH_MODE_TO_ICON: Record<SearchMode, ComponentType> = {
  RETRIEVAL_SEARCH: MagnifyingGlassIcon,
  RETRIEVAL_EXHAUSTIVE: TimeIcon,
  TABLES_QUERY: TableIcon,
};

const SEARCH_MODE_TO_DESCRIPTION: Record<SearchMode, string> = {
  RETRIEVAL_SEARCH: "Search through selected Data sources",
  RETRIEVAL_EXHAUSTIVE: "Include as much data as possible",
  TABLES_QUERY: "Tables, Spreadsheets, Notion DBs",
};

const SEARCH_MODE_TO_ACTION_MODE: Record<SearchMode, ActionMode> = {
  RETRIEVAL_SEARCH: "RETRIEVAL_SEARCH",
  RETRIEVAL_EXHAUSTIVE: "RETRIEVAL_EXHAUSTIVE",
  TABLES_QUERY: "TABLES_QUERY",
};

function ActionModeSection({
  children,
  show,
}: {
  children: ReactNode;
  show: boolean;
}) {
  return show && <div className="flex flex-col gap-6">{children}</div>;
}

export default function ActionScreen({
  owner,
  builderState,
  setBuilderState,
  setEdited,
  dustApps,
  dataSources,
  timeFrameError,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  dataSources: DataSourceType[];
  dustApps: AppType[];
  timeFrameError: string | null;
}) {
  const structuredDataEnabled = owner.flags.includes("structured_data");

  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [dataSourceToManage, setDataSourceToManage] =
    useState<AssistantBuilderDataSourceConfiguration | null>(null);
  const [showDustAppsModal, setShowDustAppsModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);

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

  const getActionType = (actionMode: ActionMode) => {
    switch (actionMode) {
      case "GENERIC":
        return "REPLY_ONLY";
      case "RETRIEVAL_EXHAUSTIVE":
      case "RETRIEVAL_SEARCH":
      case "TABLES_QUERY":
        return "USE_DATA_SOURCES";
      case "DUST_APP_RUN":
        return "RUN_DUST_APP";
      default:
        assertNever(actionMode);
    }
  };

  const getSearchMode = (actionMode: ActionMode) => {
    switch (actionMode) {
      case "RETRIEVAL_EXHAUSTIVE":
        return "RETRIEVAL_EXHAUSTIVE";
      case "RETRIEVAL_SEARCH":
        return "RETRIEVAL_SEARCH";
      case "TABLES_QUERY":
        return "TABLES_QUERY";
      default:
        // Unused for non data sources related actions.
        return "RETRIEVAL_EXHAUSTIVE";
    }
  };

  return (
    <>
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
      <div className="flex flex-col gap-4 text-sm text-element-700">
        <div className="flex flex-col gap-2">
          <Page.Header title="Action & Data sources" />
          <Page.P>
            <span className="text-sm text-element-700">
              Before replying, the assistant can perform actions like{" "}
              <span className="font-bold">searching information</span> from your{" "}
              <span className="font-bold">Data sources</span> (Connections and
              Folders).
            </span>
          </Page.P>
        </div>

        {configurableDataSources.length === 0 &&
          Object.keys(builderState.dataSourceConfigurations).length === 0 && (
            <ContentMessage title="You don't have any active Data source">
              <div className="flex flex-col gap-y-3">
                <div>
                  Assistants can incorporate existing company data and knowledge
                  to formulate answers.
                </div>
                <div>
                  There are two types of data sources: <strong>Folders</strong>{" "}
                  (Files you can upload) and <strong>Connections</strong>{" "}
                  (Automatically synchronized with platforms like Notion, Slack,
                  ...).
                </div>
                {(() => {
                  switch (owner.role) {
                    case "admin":
                      return (
                        <div>
                          <strong>
                            Visit the "Connections" and "Folders" sections in
                            the Assistants panel to add new data sources.
                          </strong>
                        </div>
                      );
                    case "builder":
                      return (
                        <div>
                          <strong>
                            Only Admins can activate Connections.
                            <br />
                            You can add Data Sources by visiting "Folders" in
                            the Assistants panel.
                          </strong>
                        </div>
                      );
                    case "user":
                      return (
                        <div>
                          <strong>
                            Only Admins and Builders can activate Connections or
                            create Folders.
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

        <div className="flex flex-row items-center space-x-2">
          <div className="text-sm font-semibold text-element-900">Action:</div>
          <DropdownMenu>
            <DropdownMenu.Button>
              <Button
                type="select"
                labelVisible={true}
                label={
                  ACTION_TYPE_TO_LABEL[getActionType(builderState.actionMode)]
                }
                icon={
                  ACTION_TYPE_TO_ICON[getActionType(builderState.actionMode)]
                }
                variant="primary"
                hasMagnifying={false}
                size="sm"
              />
            </DropdownMenu.Button>
            <DropdownMenu.Items origin="topLeft" width={260}>
              {BASIC_ACTION_TYPES.map((key) => (
                <DropdownMenu.Item
                  key={key}
                  label={ACTION_TYPE_TO_LABEL[key]}
                  icon={ACTION_TYPE_TO_ICON[key]}
                  description={ACTION_TYPE_TO_DESCRIPTION[key]}
                  onClick={() => {
                    setEdited(true);
                    setBuilderState((state) => ({
                      ...state,
                      actionMode: DEFAULT_ACTION_MODE_FOR_ACTION_TYPE[key],
                    }));
                  }}
                />
              ))}
              <DropdownMenu.SectionHeader label="Advanced actions" />
              {ADVANCED_ACTION_TYPES.map((key) => (
                <DropdownMenu.Item
                  key={key}
                  label={ACTION_TYPE_TO_LABEL[key]}
                  icon={ACTION_TYPE_TO_ICON[key]}
                  description={ACTION_TYPE_TO_DESCRIPTION[key]}
                  onClick={() => {
                    setEdited(true);
                    setBuilderState((state) => ({
                      ...state,
                      actionMode: DEFAULT_ACTION_MODE_FOR_ACTION_TYPE[key],
                    }));
                  }}
                />
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
        </div>

        {getActionType(builderState.actionMode) === "USE_DATA_SOURCES" && (
          <div className="flex flex-row items-center space-x-2">
            <div className="text-sm font-semibold text-element-900">
              Method:
            </div>
            <DropdownMenu>
              <DropdownMenu.Button>
                <Button
                  type="select"
                  labelVisible={true}
                  label={
                    SEARCH_MODE_TO_LABEL[getSearchMode(builderState.actionMode)]
                  }
                  icon={
                    SEARCH_MODE_TO_ICON[getSearchMode(builderState.actionMode)]
                  }
                  variant="tertiary"
                  hasMagnifying={false}
                  size="sm"
                />
              </DropdownMenu.Button>
              <DropdownMenu.Items origin="topLeft" width={260}>
                {SEARCH_MODES.map((key) => (
                  <DropdownMenu.Item
                    key={key}
                    label={SEARCH_MODE_TO_LABEL[key]}
                    icon={SEARCH_MODE_TO_ICON[key]}
                    description={SEARCH_MODE_TO_DESCRIPTION[key]}
                    onClick={() => {
                      setEdited(true);
                      setBuilderState((state) => ({
                        ...state,
                        actionMode: SEARCH_MODE_TO_ACTION_MODE[key],
                      }));
                    }}
                  />
                ))}
              </DropdownMenu.Items>
            </DropdownMenu>
          </div>
        )}

        <ActionModeSection show={builderState.actionMode === "GENERIC"}>
          <div className="text-sm text-element-700">
            No action is set. The assistant will use the instructions only to
            answer.
          </div>
        </ActionModeSection>

        <ActionModeSection
          show={builderState.actionMode === "RETRIEVAL_EXHAUSTIVE"}
        >
          <div>
            The assistant will include as many documents as possible from the
            data sources, using reverse chronological order.
          </div>
          <div className="grid grid-cols-2 gap-8">
            <div className="col-span-1">
              <strong>
                <span className="text-warning-500">Warning!</span> Assistants
                are limited in the amount of data they can process.
              </strong>{" "}
              Select data sources with care, and limit processing to the
              shortest relevant time frame.
            </div>
            <div className="col-span-1">
              <strong>Note:</strong> The available data sources are managed by
              administrators.
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
                  label={TIME_FRAME_UNIT_TO_LABEL[builderState.timeFrame.unit]}
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
            The assistant will perform a search on the selected data sources,
            and run the instructions on the results.{" "}
            <span className="font-semibold">
              It’s the best approach with large quantities of data.
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p>
                <strong>Select your sources with care</strong> The quality of
                the answers to specific questions will depend on the quality of
                the data.
              </p>
              <p className="mt-1">
                <strong>
                  You can narrow your search on most recent documents
                </strong>{" "}
                by adding instructions in your prompt such as 'Only search in
                documents from the last 3 months', 'Only look at data from the
                last 2 days', etc.
              </p>
            </div>
            <div>
              <p>
                <strong>Note:</strong> The available data sources are managed by
                administrators.
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

        <ActionModeSection show={builderState.actionMode === "DUST_APP_RUN"}>
          <div className="text-sm text-element-700">
            The assistant will execute a Dust Application of your design before
            answering. The output of the app (last block) is injected in context
            for the model to generate an answer. The inputs of the app will be
            automatically generated from the context of the conversation based
            on the descriptions you provided in the application's input block
            dataset schema.
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

        <ActionModeSection show={builderState.actionMode === "TABLES_QUERY"}>
          <div className="text-sm text-element-700">
            The assistant will generate a SQL query from your request, execute
            it on the tables selected and use the results to generate an answer.
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
                const tablesQueryConfiguration = state.tablesQueryConfiguration;
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
    </>
  );
}
