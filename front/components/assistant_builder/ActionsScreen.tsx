import {
  Button,
  CommandLineIcon,
  CommandLineStrokeIcon,
  DropdownMenu,
  Hoverable,
  Icon,
  Input,
  MagnifyingGlassIcon,
  MagnifyingGlassStrokeIcon,
  Modal,
  Page,
  PlanetIcon,
  PlanetStrokeIcon,
  PlusIcon,
  RobotIcon,
  RobotStrokeIcon,
  TableStrokeIcon,
  TextArea,
  TimeIcon,
  TimeStrokeIcon,
} from "@dust-tt/sparkle";
import type {
  AppType,
  DataSourceType,
  WhitelistableFeature,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, MAX_TOOLS_USE_PER_RUN_LIMIT } from "@dust-tt/types";
import type { ReactNode } from "react";
import React, { useCallback, useEffect, useState } from "react";

import {
  ActionProcess,
  isActionProcessValid,
} from "@app/components/assistant_builder/actions/ProcessAction";
import {
  ActionRetrievalExhaustive,
  ActionRetrievalSearch,
  isActionRetrievalExhaustiveValid,
  isActionRetrievalSearchValid,
} from "@app/components/assistant_builder/actions/RetrievalAction";
import {
  ActionTablesQuery,
  isActionTablesQueryValid,
} from "@app/components/assistant_builder/actions/TablesQueryAction";
import {
  ActionWebsearch,
  isActionWebsearchValid,
} from "@app/components/assistant_builder/actions/WebsearchAction";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderDustAppConfiguration,
  AssistantBuilderProcessConfiguration,
  AssistantBuilderRetrievalConfiguration,
  AssistantBuilderState,
  AssistantBuilderTablesQueryConfiguration,
} from "@app/components/assistant_builder/types";
import { getDefaultActionConfiguration } from "@app/components/assistant_builder/types";

import {
  ActionDustAppRun,
  isActionDustAppRunValid,
} from "./actions/DustAppRunAction";

const ACTION_SPECIFICATIONS: Record<
  AssistantBuilderActionConfiguration["type"],
  {
    label: string;
    description: string;
    dropDownIcon: React.ComponentProps<typeof Icon>["visual"];
    cardIcon: React.ComponentProps<typeof Icon>["visual"];
    flag: WhitelistableFeature | null;
  }
> = {
  RETRIEVAL_EXHAUSTIVE: {
    label: "Most recent data",
    description: "Include as much data as possible",
    cardIcon: TimeStrokeIcon,
    dropDownIcon: TimeIcon,
    flag: null,
  },
  RETRIEVAL_SEARCH: {
    label: "Search",
    description: "Search through selected Data sources",
    cardIcon: MagnifyingGlassStrokeIcon,
    dropDownIcon: MagnifyingGlassIcon,
    flag: null,
  },
  PROCESS: {
    label: "Extract data",
    description: "Structured extraction",
    cardIcon: RobotStrokeIcon,
    dropDownIcon: RobotIcon,
    flag: "process_action",
  },
  DUST_APP_RUN: {
    label: "Run a Dust App",
    description: "Run a Dust app, then reply",
    cardIcon: CommandLineStrokeIcon,
    dropDownIcon: CommandLineIcon,
    flag: null,
  },
  TABLES_QUERY: {
    label: "Query Tables",
    description: "Tables, Spreadsheets, Notion DBs (quantitative)",
    cardIcon: TableStrokeIcon,
    dropDownIcon: TableStrokeIcon,
    flag: null,
  },
  WEBSEARCH: {
    label: "Web search",
    description: "Perform a web search",
    cardIcon: PlanetStrokeIcon,
    dropDownIcon: PlanetIcon,
    flag: "websearch_action",
  },
};

const DATA_SOURCES_ACTION_CATEGORIES = [
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "PROCESS",
  "TABLES_QUERY",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

const CAPABILITIES_ACTION_CATEGORIES = ["WEBSEARCH"] as const satisfies Array<
  AssistantBuilderActionConfiguration["type"]
>;

const ADVANCED_ACTION_CATEGORIES = ["DUST_APP_RUN"] as const satisfies Array<
  AssistantBuilderActionConfiguration["type"]
>;

function ActionModeSection({
  children,
  show,
}: {
  children: ReactNode;
  show: boolean;
}) {
  return show && <div className="flex flex-col gap-6">{children}</div>;
}

export function isActionValid(
  action: AssistantBuilderActionConfiguration
): boolean {
  switch (action.type) {
    case "RETRIEVAL_SEARCH":
      return isActionRetrievalSearchValid(action);
    case "RETRIEVAL_EXHAUSTIVE":
      return isActionRetrievalExhaustiveValid(action);
    case "PROCESS":
      return isActionProcessValid(action);
    case "DUST_APP_RUN":
      return isActionDustAppRunValid(action);
    case "TABLES_QUERY":
      return isActionTablesQueryValid(action);
    case "WEBSEARCH":
      return isActionWebsearchValid(action);
    default:
      assertNever(action);
  }
}

export default function ActionsScreen({
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
  const [newActionModalOpen, setNewActionModalOpen] = React.useState(false);

  const [actionToEdit, setActionToEdit] =
    React.useState<AssistantBuilderActionConfiguration | null>(null);
  const [pendingAction, setPendingAction] =
    React.useState<AssistantBuilderActionConfiguration | null>(null);

  const updateAction = useCallback(
    function _updateAction({
      actionName,
      newActionName,
      newActionDescription,
      getNewActionConfig,
    }: {
      actionName: string;
      newActionName?: string;
      newActionDescription?: string;
      getNewActionConfig: (
        old: AssistantBuilderActionConfiguration["configuration"]
      ) => AssistantBuilderActionConfiguration["configuration"];
    }) {
      setEdited(true);
      setBuilderState((state) => ({
        ...state,
        actions: state.actions.map((action) =>
          action.name === actionName
            ? {
                name: newActionName ?? action.name,
                description: newActionDescription ?? action.description,
                type: action.type,
                // This is quite unsatisfying, but using `as any` here and repeating every
                // other key in the object instead of spreading is actually the safest we can do.
                // There is no way (that I could find) to make typescript understand that
                // type and configuration are compatible.
                configuration: getNewActionConfig(action.configuration) as any,
              }
            : action
        ),
      }));
    },
    [setBuilderState, setEdited]
  );

  const insertAction = useCallback(
    (action: AssistantBuilderActionConfiguration) => {
      setEdited(true);
      setBuilderState((state) => {
        return {
          ...state,
          actions: [...state.actions, action],
        };
      });
    },
    [setBuilderState, setEdited]
  );

  const deleteAction = useCallback(
    (name: string) => {
      setEdited(true);
      setBuilderState((state) => {
        return {
          ...state,
          actions: state.actions.filter((a) => a.name !== name),
        };
      });
    },
    [setBuilderState, setEdited]
  );

  return (
    <>
      <NewActionModal
        isOpen={newActionModalOpen}
        setOpen={setNewActionModalOpen}
        builderState={builderState}
        initialAction={actionToEdit ?? pendingAction}
        onSave={(newAction) => {
          setEdited(true);
          if (actionToEdit) {
            updateAction({
              actionName: actionToEdit.name,
              newActionName: newAction.name,
              newActionDescription: newAction.description,
              getNewActionConfig: () => newAction.configuration,
            });
          } else {
            insertAction(newAction);
          }
          setNewActionModalOpen(false);
          setActionToEdit(null);
          setPendingAction(null);
        }}
        onClose={() => {
          setActionToEdit(null);
          setPendingAction(null);
        }}
        updateAction={updateAction}
        owner={owner}
        setEdited={setEdited}
        dataSources={dataSources}
        dustApps={dustApps}
        deleteAction={deleteAction}
      />

      <div className="flex flex-col gap-8 text-sm text-element-700">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-col gap-2">
            <Page.Header title="Actions & Data sources" />
            <Page.P>
              <span className="text-sm text-element-700">
                Before replying, the assistant can perform actions like{" "}
                <span className="font-bold">searching information</span> from
                your <span className="font-bold">Data sources</span>{" "}
                (Connections and Folders).
              </span>
            </Page.P>
          </div>
          <div className="flex-grow" />
          <div className="self-end">
            <AdvancedSettings
              maxToolsUsePerRun={builderState.maxToolsUsePerRun}
              setMaxToolsUsePerRun={(maxToolsUsePerRun) => {
                setEdited(true);
                setBuilderState((state) => ({
                  ...state,
                  maxToolsUsePerRun,
                }));
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {builderState.actions.length === 0 && (
            <div
              className={
                "flex h-full min-h-40 items-center justify-center rounded-lg bg-structure-50"
              }
            >
              <AddAction
                owner={owner}
                builderState={builderState}
                onAddAction={(action) => {
                  setPendingAction(action);
                  setNewActionModalOpen(true);
                }}
              />
            </div>
          )}
          <div className="mx-auto grid w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {builderState.actions.map((a) => (
              <div className="flex w-full" key={a.name}>
                <ActionCard
                  action={a}
                  key={a.name}
                  editAction={() => {
                    setActionToEdit(a);
                    setNewActionModalOpen(true);
                  }}
                />
              </div>
            ))}
          </div>
          {builderState.actions.length > 0 && (
            <div>
              <AddAction
                owner={owner}
                builderState={builderState}
                onAddAction={(action) => {
                  setPendingAction(action);
                  setNewActionModalOpen(true);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function NewActionModal({
  isOpen,
  setOpen,
  initialAction,
  onSave,
  onClose,
  owner,
  setEdited,
  dataSources,
  dustApps,
  builderState,
  deleteAction,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  builderState: AssistantBuilderState;
  initialAction: AssistantBuilderActionConfiguration | null;
  onSave: (newAction: AssistantBuilderActionConfiguration) => void;
  onClose: () => void;
  updateAction: (args: {
    actionName: string;
    getNewActionConfig: (
      old: AssistantBuilderActionConfiguration["configuration"]
    ) => AssistantBuilderActionConfiguration["configuration"];
  }) => void;
  owner: WorkspaceType;
  setEdited: (edited: boolean) => void;
  dataSources: DataSourceType[];
  dustApps: AppType[];
  deleteAction: (name: string) => void;
}) {
  const [newAction, setNewAction] =
    useState<AssistantBuilderActionConfiguration | null>(null);

  useEffect(() => {
    if (initialAction && !newAction) {
      setNewAction(initialAction);
    }
  }, [initialAction, newAction]);

  const titleValid =
    (initialAction && initialAction?.name === newAction?.name) ||
    ((newAction?.name?.trim() ?? "").length > 0 &&
      !builderState.actions.some((a) => a.name === newAction?.name) &&
      /^[a-z0-9_]+$/.test(newAction?.name ?? ""));

  const descriptionValid = (newAction?.description?.trim() ?? "").length > 0;

  const onCloseLocal = () => {
    onClose();
    setOpen(false);
    setTimeout(() => {
      setNewAction(null);
    }, 500);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCloseLocal}
      hasChanged={true}
      variant="side-md"
      title="Add Action"
      onSave={
        newAction && titleValid && descriptionValid && isActionValid(newAction)
          ? () => {
              newAction.name = newAction.name.trim();
              newAction.description = newAction.description.trim();
              onSave(newAction);
              onCloseLocal();
            }
          : undefined
      }
    >
      <div className="w-full pl-4 pt-12">
        <div className="flex flex-col gap-4">
          {newAction && (
            <ActionEditor
              action={newAction}
              updateAction={({
                actionName,
                actionDescription,
                getNewActionConfig,
              }) =>
                setNewAction({
                  ...newAction,
                  configuration: getNewActionConfig(
                    newAction.configuration
                  ) as any,
                  description: actionDescription,
                  name: actionName,
                })
              }
              owner={owner}
              setEdited={setEdited}
              dataSources={dataSources}
              dustApps={dustApps}
              builderState={builderState}
              titleValid={titleValid}
              descriptionValid={descriptionValid}
            />
          )}
          {initialAction && (
            <div className="pt-8">
              <Button
                variant="primaryWarning"
                label="Delete Action"
                onClick={() => {
                  deleteAction(initialAction.name);
                  onCloseLocal();
                }}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ActionCard({
  action,
  editAction,
}: {
  action: AssistantBuilderActionConfiguration;
  editAction: () => void;
}) {
  const spec = ACTION_SPECIFICATIONS[action.type];
  if (!spec) {
    // Unreachable
    return null;
  }
  return (
    <Hoverable onClick={editAction}>
      <div className="mx-auto inline-block flex w-72 flex-col gap-4 rounded-lg border border-structure-200 px-4 pb-4 pt-2 drop-shadow-md">
        <div className="flex flex-row gap-2 font-semibold text-element-800">
          <Icon visual={spec.cardIcon} />
          <div className="truncate">{action.name}</div>
        </div>
        <div>{action.description}</div>
      </div>
    </Hoverable>
  );
}

function ActionEditor({
  action,
  titleValid,
  descriptionValid,
  updateAction,
  owner,
  setEdited,
  dataSources,
  dustApps,
  builderState,
}: {
  action: AssistantBuilderActionConfiguration;
  titleValid: boolean;
  descriptionValid: boolean;
  updateAction: (args: {
    actionName: string;
    actionDescription: string;
    getNewActionConfig: (
      old: AssistantBuilderActionConfiguration["configuration"]
    ) => AssistantBuilderActionConfiguration["configuration"];
  }) => void;
  owner: WorkspaceType;
  setEdited: (edited: boolean) => void;
  dataSources: DataSourceType[];
  dustApps: AppType[];
  builderState: AssistantBuilderState;
}) {
  return (
    <div>
      <ActionModeSection show={true}>
        {(() => {
          switch (action.type) {
            case "DUST_APP_RUN":
              return (
                <ActionDustAppRun
                  owner={owner}
                  actionConfigration={action.configuration}
                  dustApps={dustApps}
                  updateAction={(setNewAction) => {
                    updateAction({
                      actionName: action.name,
                      actionDescription: action.description,
                      getNewActionConfig: (old) =>
                        setNewAction(
                          old as AssistantBuilderDustAppConfiguration
                        ),
                    });
                  }}
                  setEdited={setEdited}
                />
              );
            case "RETRIEVAL_SEARCH":
              return (
                <ActionRetrievalSearch
                  owner={owner}
                  actionConfiguration={action.configuration}
                  dataSources={dataSources}
                  updateAction={(setNewAction) => {
                    updateAction({
                      actionName: action.name,
                      actionDescription: action.description,
                      getNewActionConfig: (old) =>
                        setNewAction(
                          old as AssistantBuilderRetrievalConfiguration
                        ),
                    });
                  }}
                  setEdited={setEdited}
                />
              );
            case "RETRIEVAL_EXHAUSTIVE":
              return (
                <ActionRetrievalExhaustive
                  owner={owner}
                  actionConfiguration={action.configuration}
                  dataSources={dataSources}
                  updateAction={(setNewAction) => {
                    updateAction({
                      actionName: action.name,
                      actionDescription: action.description,
                      getNewActionConfig: (old) =>
                        setNewAction(
                          old as AssistantBuilderRetrievalConfiguration
                        ),
                    });
                  }}
                  setEdited={setEdited}
                />
              );
            case "PROCESS":
              return (
                <ActionProcess
                  owner={owner}
                  instructions={builderState.instructions}
                  actionConfiguration={action.configuration}
                  dataSources={dataSources}
                  updateAction={(setNewAction) => {
                    updateAction({
                      actionName: action.name,
                      actionDescription: action.description,
                      getNewActionConfig: (old) =>
                        setNewAction(
                          old as AssistantBuilderProcessConfiguration
                        ),
                    });
                  }}
                  setEdited={setEdited}
                />
              );
            case "TABLES_QUERY":
              return (
                <ActionTablesQuery
                  owner={owner}
                  actionConfiguration={action.configuration}
                  dataSources={dataSources}
                  updateAction={(setNewAction) => {
                    updateAction({
                      actionName: action.name,
                      actionDescription: action.description,
                      getNewActionConfig: (old) =>
                        setNewAction(
                          old as AssistantBuilderTablesQueryConfiguration
                        ),
                    });
                  }}
                  setEdited={setEdited}
                />
              );
            case "WEBSEARCH":
              return <ActionWebsearch />;
            default:
              assertNever(action);
          }
        })()}
      </ActionModeSection>
      <div className="flex flex-col gap-4 pt-8">
        {["TABLES_QUERY", "RETRIEVAL_EXHAUSTIVE", "RETRIEVAL_SEARCH"].includes(
          action.type as any
        ) ? (
          <div className="flex flex-col gap-2">
            <div className="font-semibold text-element-800">
              What's the data?
            </div>
            <div className="text-sm text-element-600">
              Clarify the data's content and context to guide your Assistant in
              determining when and how to utilize it.
            </div>
          </div>
        ) : (
          <div className="font-semibold text-element-800">
            Action description
          </div>
        )}
        <TextArea
          placeholder="My action description.."
          value={action.description}
          onChange={(v) => {
            updateAction({
              actionName: action.name,
              actionDescription: v,
              getNewActionConfig: (old) => old,
            });
          }}
          error={!descriptionValid ? "Description cannot be empty" : null}
        />
        <div className="font-semibold text-element-800">Name of the action</div>
        <Input
          name="actionName"
          placeholder="My action name.."
          value={action.name}
          onChange={(v) => {
            updateAction({
              actionName: v,
              actionDescription: action.description,
              getNewActionConfig: (old) => old,
            });
          }}
          error={!titleValid ? "Name already exists" : null}
          className="text-sm"
        />
      </div>
    </div>
  );
}

function AdvancedSettings({
  maxToolsUsePerRun,
  setMaxToolsUsePerRun,
}: {
  maxToolsUsePerRun: number | null;
  setMaxToolsUsePerRun: (maxToolsUsePerRun: number | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button
          label="Advanced settings"
          variant="tertiary"
          size="sm"
          type="menu"
        />
      </DropdownMenu.Button>
      <DropdownMenu.Items width={240} overflow="visible">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col items-start justify-start">
              <div className="w-full grow text-sm font-bold text-element-800">
                Max actions per run
              </div>
              <div className="w-full grow text-sm text-element-600">
                up to {MAX_TOOLS_USE_PER_RUN_LIMIT}
              </div>
            </div>
            <Input
              value={maxToolsUsePerRun?.toString() ?? ""}
              placeholder=""
              name="maxToolsUsePerRun"
              onChange={(v) => {
                if (!v || v === "") {
                  setMaxToolsUsePerRun(null);
                  return;
                }
                const value = parseInt(v);
                if (
                  !isNaN(value) &&
                  value >= 0 &&
                  value <= MAX_TOOLS_USE_PER_RUN_LIMIT
                ) {
                  setMaxToolsUsePerRun(value);
                }
              }}
            />
          </div>
        </div>
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}

function AddAction({
  owner,
  builderState,
  onAddAction,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  onAddAction: (action: AssistantBuilderActionConfiguration) => void;
}) {
  const onAddLocal = (action: AssistantBuilderActionConfiguration) => {
    let index = 1;
    const suffixedName = () =>
      index > 1 ? `${action.name}_${index}` : action.name;
    while (builderState.actions.some((a) => a.name === suffixedName())) {
      index += 1;
    }
    action.name = suffixedName();
    onAddAction(action);
  };

  const filteredCapabilities = CAPABILITIES_ACTION_CATEGORIES.filter((key) => {
    const flag = ACTION_SPECIFICATIONS[key].flag;
    return !flag || owner.flags.includes(flag);
  });

  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button variant="primary" label="Add an action" icon={PlusIcon} />
      </DropdownMenu.Button>
      <DropdownMenu.Items origin="topLeft" width={320} overflow="visible">
        <DropdownMenu.SectionHeader label="DATA SOURCES" />
        {DATA_SOURCES_ACTION_CATEGORIES.map((key) => {
          const spec = ACTION_SPECIFICATIONS[key];
          const defaultAction = getDefaultActionConfiguration(key);
          if (!defaultAction) {
            // Unreachable
            return null;
          }
          return (
            <DropdownMenu.Item
              key={key}
              label={spec.label}
              icon={spec.dropDownIcon}
              description={spec.description}
              onClick={() => onAddLocal(defaultAction)}
            />
          );
        })}
        {filteredCapabilities.length > 0 && (
          <DropdownMenu.SectionHeader label="CAPABILITIES" />
        )}
        {filteredCapabilities.map((key) => {
          const spec = ACTION_SPECIFICATIONS[key];
          const defaultAction = getDefaultActionConfiguration(key);
          if (!defaultAction) {
            // Unreachable
            return null;
          }
          return (
            <DropdownMenu.Item
              key={key}
              label={spec.label}
              icon={spec.dropDownIcon}
              description={spec.description}
              onClick={() => onAddLocal(defaultAction)}
            />
          );
        })}

        <DropdownMenu.SectionHeader label="ADVANCED ACTIONS" />
        {ADVANCED_ACTION_CATEGORIES.map((key) => {
          const spec = ACTION_SPECIFICATIONS[key];
          const defaultAction = getDefaultActionConfiguration(key);
          if (!defaultAction) {
            // Unreachable
            return null;
          }
          return (
            <DropdownMenu.Item
              key={key}
              label={spec.label}
              icon={spec.dropDownIcon}
              description={spec.description}
              onClick={() => onAddLocal(defaultAction)}
            />
          );
        })}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
