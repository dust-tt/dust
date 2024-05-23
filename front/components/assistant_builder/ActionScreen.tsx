import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  CommandLineIcon,
  ContentMessage,
  DropdownMenu,
  MagnifyingGlassIcon,
  Page,
  ScanIcon,
  Square3Stack3DIcon,
  TableIcon,
  TimeIcon,
} from "@dust-tt/sparkle";
import type {
  AppType,
  DataSourceType,
  WhitelistableFeature,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, removeNulls } from "@dust-tt/types";
import type { ComponentType, ReactNode } from "react";
import React from "react";

import { ActionProcess } from "@app/components/assistant_builder/actions/ProcessAction";
import {
  ActionRetrievalExhaustive,
  ActionRetrievalSearch,
} from "@app/components/assistant_builder/actions/RetrievalAction";
import { ActionTablesQuery } from "@app/components/assistant_builder/actions/TablesQueryAction";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderActionType,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import { getDefaultActionConfiguration } from "@app/components/assistant_builder/types";
import { useDeprecatedDefaultSingleAction } from "@app/lib/client/assistant_builder/deprecated_single_action";

import { ActionDustAppRun } from "./actions/DustAppRunAction";

const BASIC_ACTION_CATEGORIES = [
  "REPLY_ONLY",
  "USE_DATA_SOURCES",
  "WEBSEARCH",
] as const;
const ADVANCED_ACTION_CATEGORIES = ["RUN_DUST_APP"] as const;

type ActionCategory =
  | (typeof BASIC_ACTION_CATEGORIES)[number]
  | (typeof ADVANCED_ACTION_CATEGORIES)[number];

const SEARCH_MODES = [
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "TABLES_QUERY",
  "PROCESS",
] as const;
type SearchMode = (typeof SEARCH_MODES)[number];

const ACTION_CATEGORY_SPECIFICATIONS: Record<
  ActionCategory,
  {
    label: string;
    icon: ComponentType;
    description: string;
    defaultActionType: AssistantBuilderActionType | null;
    flag?: WhitelistableFeature | null;
  }
> = {
  REPLY_ONLY: {
    label: "Reply only",
    icon: ChatBubbleBottomCenterTextIcon,
    description: "Direct answer from the model",
    defaultActionType: null,
  },
  USE_DATA_SOURCES: {
    label: "Use Data sources",
    icon: Square3Stack3DIcon,
    description: "Use Data sources to reply",
    defaultActionType: "RETRIEVAL_SEARCH",
  },
  RUN_DUST_APP: {
    label: "Run a Dust app",
    icon: CommandLineIcon,
    description: "Run a Dust app, then reply",
    defaultActionType: "DUST_APP_RUN",
  },
  WEBSEARCH: {
    label: "Web search",
    icon: MagnifyingGlassIcon,
    description: "Perform a web search",
    defaultActionType: "WEBSEARCH",
    flag: "websearch_action",
  },
};

const SEARCH_MODE_SPECIFICATIONS: Record<
  SearchMode,
  {
    actionType: AssistantBuilderActionType;
    icon: ComponentType;
    label: string;
    description: string;
    flag: WhitelistableFeature | null;
  }
> = {
  RETRIEVAL_SEARCH: {
    actionType: "RETRIEVAL_SEARCH",
    icon: MagnifyingGlassIcon,
    label: "Search",
    description: "Search through selected Data sources",
    flag: null,
  },
  RETRIEVAL_EXHAUSTIVE: {
    actionType: "RETRIEVAL_EXHAUSTIVE",
    icon: TimeIcon,
    label: "Most recent data",
    description: "Include as much data as possible",
    flag: null,
  },
  TABLES_QUERY: {
    actionType: "TABLES_QUERY",
    icon: TableIcon,
    label: "Query Tables",
    description: "Tables, Spreadsheets, Notion DBs",
    flag: null,
  },
  PROCESS: {
    actionType: "PROCESS",
    icon: ScanIcon,
    label: "Extract data",
    description: "Structured extraction",
    flag: "process_action",
  },
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
  dustApps,
  dataSources,
  setBuilderState,
  setEdited,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  dataSources: DataSourceType[];
  dustApps: AppType[];
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
}) {
  const getActionCategory = (actionType: AssistantBuilderActionType | null) => {
    switch (actionType) {
      case null:
        return "REPLY_ONLY";
      case "RETRIEVAL_EXHAUSTIVE":
      case "RETRIEVAL_SEARCH":
      case "TABLES_QUERY":
      case "PROCESS":
        return "USE_DATA_SOURCES";
      case "DUST_APP_RUN":
        return "RUN_DUST_APP";
      case "WEBSEARCH":
        return "WEBSEARCH";
      default:
        assertNever(actionType);
    }
  };

  const getSearchMode = (actionType: AssistantBuilderActionType | null) => {
    switch (actionType) {
      case "RETRIEVAL_EXHAUSTIVE":
        return "RETRIEVAL_EXHAUSTIVE";
      case "RETRIEVAL_SEARCH":
        return "RETRIEVAL_SEARCH";
      case "TABLES_QUERY":
        return "TABLES_QUERY";
      case "PROCESS":
        return "PROCESS";

      case null:
      case "WEBSEARCH":
      case "DUST_APP_RUN":
        // Unused for non data sources related actions.
        return "RETRIEVAL_SEARCH";
      default:
        assertNever(actionType);
    }
  };

  const action = useDeprecatedDefaultSingleAction(builderState) ?? null;

  const dataSourceConfigs =
    action && "dataSourceConfigurations" in action.configuration
      ? action.configuration.dataSourceConfigurations
      : {};
  const noDataSources =
    dataSources.length === 0 && Object.keys(dataSourceConfigs).length === 0;
  const actionCategory = getActionCategory(action?.type ?? null);
  const actionCategorySpec = ACTION_CATEGORY_SPECIFICATIONS[actionCategory];
  const searchMode = getSearchMode(action?.type ?? null);
  const searchModeSpec = SEARCH_MODE_SPECIFICATIONS[searchMode];

  return (
    <>
      <div className="flex flex-col gap-4 text-sm text-element-700">
        <div className="flex flex-col gap-2">
          <Page.Header title="Actions & Data sources" />
          <Page.P>
            <span className="text-sm text-element-700">
              Before replying, the assistant can perform actions like{" "}
              <span className="font-bold">searching information</span> from your{" "}
              <span className="font-bold">Data sources</span> (Connections and
              Folders).
            </span>
          </Page.P>
        </div>

        <div className="flex flex-row items-center space-x-2">
          <div className="text-sm font-semibold text-element-900">Action:</div>
          <DropdownMenu>
            <DropdownMenu.Button>
              <Button
                type="select"
                labelVisible={true}
                label={actionCategorySpec.label}
                icon={actionCategorySpec.icon}
                variant="primary"
                hasMagnifying={false}
                size="sm"
              />
            </DropdownMenu.Button>
            <DropdownMenu.Items origin="topLeft" width={260}>
              {BASIC_ACTION_CATEGORIES.filter((key) => {
                const flag = ACTION_CATEGORY_SPECIFICATIONS[key].flag;
                return !flag || owner.flags.includes(flag);
              }).map((key) => {
                const spec = ACTION_CATEGORY_SPECIFICATIONS[key];
                const defaultAction = getDefaultActionConfiguration(
                  spec.defaultActionType
                );
                return (
                  <DropdownMenu.Item
                    key={key}
                    label={spec.label}
                    icon={spec.icon}
                    description={spec.description}
                    onClick={() => {
                      setEdited(true);
                      setBuilderState((state) => {
                        const newState: AssistantBuilderState = {
                          ...state,
                          actions: removeNulls([defaultAction]),
                        };
                        return newState;
                      });
                    }}
                  />
                );
              })}
              <DropdownMenu.SectionHeader label="Advanced actions" />
              {ADVANCED_ACTION_CATEGORIES.map((key) => {
                const spec = ACTION_CATEGORY_SPECIFICATIONS[key];
                const defaultAction = getDefaultActionConfiguration(
                  spec.defaultActionType
                );
                return (
                  <DropdownMenu.Item
                    key={key}
                    label={spec.label}
                    icon={spec.icon}
                    description={spec.description}
                    onClick={() => {
                      setEdited(true);
                      setBuilderState((state) => {
                        const newState: AssistantBuilderState = {
                          ...state,
                          actions: removeNulls([defaultAction]),
                        };
                        return newState;
                      });
                    }}
                  />
                );
              })}
            </DropdownMenu.Items>
          </DropdownMenu>
        </div>

        {getActionCategory(action?.type ?? null) === "USE_DATA_SOURCES" && (
          <>
            {noDataSources ? (
              <ContentMessage
                title="You don't have any Data source available"
                variant="pink"
              >
                <div className="flex flex-col gap-y-3">
                  {(() => {
                    switch (owner.role) {
                      case "admin":
                        return (
                          <div>
                            Go to <strong>"Connections"</strong>,{" "}
                            <strong>"Websites"</strong> and{" "}
                            <strong>"Folders"</strong>
                            sections in the Build panel to add new data sources.
                          </div>
                        );
                      case "builder":
                        return (
                          <div>
                            You can add Data Sources by visiting the "Websites"
                            and "Folders" sections in the Build panel.
                            <strong>
                              Only Admins can activate Connections (Notion,
                              Drive…).
                            </strong>
                          </div>
                        );
                      case "user":
                        return (
                          <div>
                            Contact an <strong>Admin</strong> to add Data
                            sources to your workspace!
                          </div>
                        );
                      case "none":
                        return <></>;
                      default:
                        assertNever(owner.role);
                    }
                  })()}
                </div>
              </ContentMessage>
            ) : (
              <div className="flex flex-row items-center space-x-2">
                <div className="text-sm font-semibold text-element-900">
                  Method:
                </div>
                <DropdownMenu>
                  <DropdownMenu.Button>
                    <Button
                      type="select"
                      labelVisible={true}
                      label={searchModeSpec.label}
                      icon={searchModeSpec.icon}
                      variant="tertiary"
                      hasMagnifying={false}
                      size="sm"
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items origin="topLeft" width={260}>
                    {SEARCH_MODES.filter((key) => {
                      const flag = SEARCH_MODE_SPECIFICATIONS[key].flag;
                      return flag === null || owner.flags.includes(flag);
                    }).map((key) => {
                      const spec = SEARCH_MODE_SPECIFICATIONS[key];
                      const defaultAction = getDefaultActionConfiguration(
                        spec.actionType
                      );
                      return (
                        <DropdownMenu.Item
                          key={key}
                          label={spec.label}
                          icon={spec.icon}
                          description={spec.description}
                          onClick={() => {
                            setEdited(true);
                            setBuilderState((state) => {
                              const newBuilderState: AssistantBuilderState = {
                                ...state,
                                actions: removeNulls([defaultAction]),
                              };
                              return newBuilderState;
                            });
                          }}
                        />
                      );
                    })}
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>
            )}
          </>
        )}

        <ActionModeSection show={!action}>
          <div className="pb-16"></div>
        </ActionModeSection>

        <ActionModeSection
          show={action?.type === "RETRIEVAL_SEARCH" && !noDataSources}
        >
          <ActionRetrievalSearch
            owner={owner}
            actionConfiguration={
              action?.type === "RETRIEVAL_SEARCH" ? action.configuration : null
            }
            dataSources={dataSources}
            updateAction={(setNewAction) => {
              setBuilderState((state) => {
                const previousAction = state.actions[0];
                if (
                  !previousAction ||
                  previousAction.type !== "RETRIEVAL_SEARCH"
                ) {
                  // Unreachable
                  return state;
                }
                const newActionConfig = setNewAction(
                  previousAction.configuration
                );
                const newAction: AssistantBuilderActionConfiguration = {
                  type: "RETRIEVAL_SEARCH",
                  configuration: newActionConfig,
                  name: previousAction.name,
                  description: previousAction.description,
                };
                return {
                  ...state,
                  actions: removeNulls([newAction]),
                };
              });
            }}
            setEdited={setEdited}
          />
        </ActionModeSection>

        <ActionModeSection
          show={action?.type === "RETRIEVAL_EXHAUSTIVE" && !noDataSources}
        >
          <ActionRetrievalExhaustive
            owner={owner}
            actionConfiguration={
              action?.type === "RETRIEVAL_EXHAUSTIVE"
                ? action.configuration
                : null
            }
            dataSources={dataSources}
            updateAction={(setNewAction) => {
              setBuilderState((state) => {
                const previousAction = state.actions[0];
                if (
                  !previousAction ||
                  previousAction.type !== "RETRIEVAL_EXHAUSTIVE"
                ) {
                  // Unreachable
                  return state;
                }
                const newActionConfig = setNewAction(
                  previousAction.configuration
                );
                const newAction: AssistantBuilderActionConfiguration = {
                  type: "RETRIEVAL_EXHAUSTIVE",
                  configuration: newActionConfig,
                  name: previousAction.name,
                  description: previousAction.description,
                };
                return {
                  ...state,
                  actions: removeNulls([newAction]),
                };
              });
            }}
            setEdited={setEdited}
          />
        </ActionModeSection>

        <ActionModeSection show={action?.type === "PROCESS" && !noDataSources}>
          <ActionProcess
            owner={owner}
            instructions={builderState.instructions}
            actionConfiguration={
              action?.type === "PROCESS" ? action.configuration : null
            }
            dataSources={dataSources}
            updateAction={(setNewAction) => {
              setBuilderState((state) => {
                const previousAction = state.actions[0];
                if (!previousAction || previousAction.type !== "PROCESS") {
                  // Unreachable
                  return state;
                }
                const newActionConfig = setNewAction(
                  previousAction.configuration
                );
                const newAction: AssistantBuilderActionConfiguration = {
                  type: "PROCESS",
                  configuration: newActionConfig,
                  name: previousAction.name,
                  description: previousAction.description,
                };
                return {
                  ...state,
                  actions: removeNulls([newAction]),
                };
              });
            }}
            setEdited={setEdited}
          />
        </ActionModeSection>

        <ActionModeSection
          show={action?.type === "TABLES_QUERY" && !noDataSources}
        >
          <ActionTablesQuery
            owner={owner}
            actionConfiguration={
              action?.type === "TABLES_QUERY" ? action.configuration : null
            }
            dataSources={dataSources}
            updateAction={(setNewAction) => {
              setBuilderState((state) => {
                const previousAction = state.actions[0];
                if (!previousAction || previousAction.type !== "TABLES_QUERY") {
                  // Unreachable
                  return state;
                }
                const newActionConfig = setNewAction(
                  previousAction.configuration
                );
                const newAction: AssistantBuilderActionConfiguration = {
                  type: "TABLES_QUERY",
                  configuration: newActionConfig,
                  name: previousAction.name,
                  description: previousAction.description,
                };
                return {
                  ...state,
                  actions: removeNulls([newAction]),
                };
              });
            }}
            setEdited={setEdited}
          />
        </ActionModeSection>

        <ActionModeSection show={action?.type === "DUST_APP_RUN"}>
          <ActionDustAppRun
            owner={owner}
            actionConfigration={
              action?.type === "DUST_APP_RUN" ? action.configuration : null
            }
            dustApps={dustApps}
            updateAction={(setNewAction) => {
              setBuilderState((state) => {
                const previousAction = state.actions[0];
                if (!previousAction || previousAction.type !== "DUST_APP_RUN") {
                  // Unreachable
                  return state;
                }
                const newActionConfig = setNewAction(
                  previousAction.configuration
                );
                const newAction: AssistantBuilderActionConfiguration = {
                  type: "DUST_APP_RUN",
                  configuration: newActionConfig,
                  name: previousAction.name,
                  description: previousAction.description,
                };
                return {
                  ...state,
                  actions: removeNulls([newAction]),
                };
              });
            }}
            setEdited={setEdited}
          />
        </ActionModeSection>
      </div>
    </>
  );
}
