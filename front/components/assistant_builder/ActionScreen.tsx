import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  CommandLineIcon,
  ContentMessage,
  DropdownMenu,
  MagnifyingGlassIcon,
  Page,
  RobotIcon,
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
import { assertNever } from "@dust-tt/types";
import type { ComponentType, ReactNode } from "react";

import {
  ActionProcess,
  isActionProcessValid,
} from "@app/components/assistant_builder/actions/ProcessAction";
import {
  ActionRetrievalExhaustive,
  ActionRetrievalSearch,
  isActionRetrievalSearchValid,
} from "@app/components/assistant_builder/actions/RetrievalAction";
import {
  ActionTablesQuery,
  isActionTablesQueryValid,
} from "@app/components/assistant_builder/actions/TablesQueryAction";
import type {
  ActionMode,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";

import {
  ActionDustAppRun,
  isActionDustAppRunValid,
} from "./actions/DustAppRunAction";

const BASIC_ACTION_TYPES = ["REPLY_ONLY", "USE_DATA_SOURCES"] as const;
const ADVANCED_ACTION_TYPES = ["RUN_DUST_APP"] as const;

type ActionType =
  | (typeof BASIC_ACTION_TYPES)[number]
  | (typeof ADVANCED_ACTION_TYPES)[number];

const SEARCH_MODES = [
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "TABLES_QUERY",
  "PROCESS",
] as const;
type SearchMode = (typeof SEARCH_MODES)[number];

const ACTION_TYPE_SPECIFICATIONS: Record<
  ActionType,
  {
    label: string;
    icon: ComponentType;
    description: string;
    defaultActionMode: ActionMode;
  }
> = {
  REPLY_ONLY: {
    label: "Reply only",
    icon: ChatBubbleBottomCenterTextIcon,
    description: "Direct answer from the model",
    defaultActionMode: "GENERIC",
  },
  USE_DATA_SOURCES: {
    label: "Use Data sources",
    icon: Square3Stack3DIcon,
    description: "Use Data sources to reply",
    defaultActionMode: "RETRIEVAL_SEARCH",
  },
  RUN_DUST_APP: {
    label: "Run a Dust app",
    icon: CommandLineIcon,
    description: "Run a Dust app, then reply",
    defaultActionMode: "DUST_APP_RUN",
  },
};

const SEARCH_MODE_SPECIFICATIONS: Record<
  SearchMode,
  {
    actionMode: ActionMode;
    icon: ComponentType;
    label: string;
    description: string;
    flag: WhitelistableFeature | null;
  }
> = {
  RETRIEVAL_SEARCH: {
    actionMode: "RETRIEVAL_SEARCH",
    icon: MagnifyingGlassIcon,
    label: "Search",
    description: "Search through selected Data sources",
    flag: null,
  },
  RETRIEVAL_EXHAUSTIVE: {
    actionMode: "RETRIEVAL_EXHAUSTIVE",
    icon: TimeIcon,
    label: "Most recent data",
    description: "Include as much data as possible",
    flag: null,
  },
  TABLES_QUERY: {
    actionMode: "TABLES_QUERY",
    icon: TableIcon,
    label: "Query Tables",
    description: "Tables, Spreadsheets, Notion DBs",
    flag: null,
  },
  PROCESS: {
    actionMode: "PROCESS",
    icon: RobotIcon,
    label: "Process data",
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

export function isActionValid(builderState: AssistantBuilderState): boolean {
  switch (builderState.actionMode) {
    case "GENERIC":
      return true;
    case "RETRIEVAL_SEARCH":
      return isActionRetrievalSearchValid(builderState);
    case "RETRIEVAL_EXHAUSTIVE":
      return isActionRetrievalSearchValid(builderState);
    case "PROCESS":
      return isActionProcessValid(builderState);
    case "DUST_APP_RUN":
      return isActionDustAppRunValid(builderState);
    case "TABLES_QUERY":
      return isActionTablesQueryValid(builderState);
    default:
      assertNever(builderState.actionMode);
  }
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
  const getActionType = (actionMode: ActionMode) => {
    switch (actionMode) {
      case "GENERIC":
        return "REPLY_ONLY";
      case "RETRIEVAL_EXHAUSTIVE":
      case "RETRIEVAL_SEARCH":
      case "TABLES_QUERY":
      case "PROCESS":
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
      case "PROCESS":
        return "PROCESS";

      case "GENERIC":
      case "DUST_APP_RUN":
        // Unused for non data sources related actions.
        return "RETRIEVAL_SEARCH";
      default:
        assertNever(actionMode);
    }
  };

  const noDataSources =
    dataSources.length === 0 &&
    Object.keys(
      builderState.retrievalConfiguration?.dataSourceConfigurations || {}
    ).length === 0;

  return (
    <>
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

        <div className="flex flex-row items-center space-x-2">
          <div className="text-sm font-semibold text-element-900">Action:</div>
          <DropdownMenu>
            <DropdownMenu.Button>
              <Button
                type="select"
                labelVisible={true}
                label={
                  ACTION_TYPE_SPECIFICATIONS[
                    getActionType(builderState.actionMode)
                  ].label
                }
                icon={
                  ACTION_TYPE_SPECIFICATIONS[
                    getActionType(builderState.actionMode)
                  ].icon
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
                  label={ACTION_TYPE_SPECIFICATIONS[key].label}
                  icon={ACTION_TYPE_SPECIFICATIONS[key].icon}
                  description={ACTION_TYPE_SPECIFICATIONS[key].description}
                  onClick={() => {
                    setEdited(true);
                    setBuilderState((state) => ({
                      ...state,
                      actionMode:
                        ACTION_TYPE_SPECIFICATIONS[key].defaultActionMode,
                    }));
                  }}
                />
              ))}
              <DropdownMenu.SectionHeader label="Advanced actions" />
              {ADVANCED_ACTION_TYPES.map((key) => (
                <DropdownMenu.Item
                  key={key}
                  label={ACTION_TYPE_SPECIFICATIONS[key].label}
                  icon={ACTION_TYPE_SPECIFICATIONS[key].icon}
                  description={ACTION_TYPE_SPECIFICATIONS[key].description}
                  onClick={() => {
                    setEdited(true);
                    setBuilderState((state) => ({
                      ...state,
                      actionMode:
                        ACTION_TYPE_SPECIFICATIONS[key].defaultActionMode,
                    }));
                  }}
                />
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
        </div>

        {getActionType(builderState.actionMode) === "USE_DATA_SOURCES" && (
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
                      label={
                        SEARCH_MODE_SPECIFICATIONS[
                          getSearchMode(builderState.actionMode)
                        ].label
                      }
                      icon={
                        SEARCH_MODE_SPECIFICATIONS[
                          getSearchMode(builderState.actionMode)
                        ].icon
                      }
                      variant="tertiary"
                      hasMagnifying={false}
                      size="sm"
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items origin="topLeft" width={260}>
                    {SEARCH_MODES.filter((key) => {
                      const flag = SEARCH_MODE_SPECIFICATIONS[key].flag;
                      return flag === null || owner.flags.includes(flag);
                    }).map((key) => (
                      <DropdownMenu.Item
                        key={key}
                        label={SEARCH_MODE_SPECIFICATIONS[key].label}
                        icon={SEARCH_MODE_SPECIFICATIONS[key].icon}
                        description={
                          SEARCH_MODE_SPECIFICATIONS[key].description
                        }
                        onClick={() => {
                          setEdited(true);
                          setBuilderState((state) => ({
                            ...state,
                            actionMode:
                              SEARCH_MODE_SPECIFICATIONS[key].actionMode,
                          }));
                        }}
                      />
                    ))}
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>
            )}
          </>
        )}

        <ActionModeSection show={builderState.actionMode === "GENERIC"}>
          <div className="pb-16"></div>
        </ActionModeSection>

        <ActionModeSection
          show={
            builderState.actionMode === "RETRIEVAL_SEARCH" && !noDataSources
          }
        >
          <ActionRetrievalSearch
            owner={owner}
            builderState={builderState}
            dataSources={dataSources}
            setBuilderState={setBuilderState}
            setEdited={setEdited}
          />
        </ActionModeSection>

        <ActionModeSection
          show={
            builderState.actionMode === "RETRIEVAL_EXHAUSTIVE" && !noDataSources
          }
        >
          <ActionRetrievalExhaustive
            owner={owner}
            builderState={builderState}
            dataSources={dataSources}
            setBuilderState={setBuilderState}
            setEdited={setEdited}
          />
        </ActionModeSection>

        <ActionModeSection
          show={builderState.actionMode === "PROCESS" && !noDataSources}
        >
          <ActionProcess
            owner={owner}
            builderState={builderState}
            dataSources={dataSources}
            setBuilderState={setBuilderState}
            setEdited={setEdited}
          />
        </ActionModeSection>

        <ActionModeSection
          show={builderState.actionMode === "TABLES_QUERY" && !noDataSources}
        >
          <ActionTablesQuery
            owner={owner}
            builderState={builderState}
            dataSources={dataSources}
            setBuilderState={setBuilderState}
            setEdited={setEdited}
          />
        </ActionModeSection>

        <ActionModeSection show={builderState.actionMode === "DUST_APP_RUN"}>
          <ActionDustAppRun
            owner={owner}
            builderState={builderState}
            dustApps={dustApps}
            setBuilderState={setBuilderState}
            setEdited={setEdited}
          />
        </ActionModeSection>
      </div>
    </>
  );
}
