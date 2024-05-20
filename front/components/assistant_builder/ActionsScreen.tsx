import {
  Button,
  ClockStrokeIcon,
  CommandLineStrokeIcon,
  DropdownMenu,
  Hoverable,
  Icon,
  Input,
  MagnifyingGlassStrokeIcon,
  Modal,
  Page,
  PlusIcon,
  RobotStrokeIcon,
  TableStrokeIcon,
} from "@dust-tt/sparkle";
import type { AppType, DataSourceType, WorkspaceType } from "@dust-tt/types";
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
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderDustAppConfiguration,
  AssistantBuilderProcessConfiguration,
  AssistantBuilderRetrievalConfiguration,
  AssistantBuilderState,
  AssistantBuilderTablesQueryConfiguration,
} from "@app/components/assistant_builder/types";
import { getDefaultActionConfiguration } from "@app/components/assistant_builder/types";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";

import {
  ActionDustAppRun,
  isActionDustAppRunValid,
} from "./actions/DustAppRunAction";

const ACTION_TYPE_TO_LABEL: Record<
  AssistantBuilderActionConfiguration["type"],
  string
> = {
  RETRIEVAL_SEARCH: "Search",
  RETRIEVAL_EXHAUSTIVE: "Exhaustive Search",
  PROCESS: "Process",
  DUST_APP_RUN: "Dust App",
  TABLES_QUERY: "Tables Query",
};

const ACTION_TYPE_TO_ICON: Record<
  AssistantBuilderActionConfiguration["type"],
  React.ComponentProps<typeof Icon>["visual"]
> = {
  RETRIEVAL_SEARCH: MagnifyingGlassStrokeIcon,
  RETRIEVAL_EXHAUSTIVE: ClockStrokeIcon,
  PROCESS: RobotStrokeIcon,
  DUST_APP_RUN: CommandLineStrokeIcon,
  TABLES_QUERY: TableStrokeIcon,
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

  const allActionsValid = builderState.actions.every(isActionValid);

  return (
    <>
      <NewActionModal
        isOpen={newActionModalOpen}
        setOpen={setNewActionModalOpen}
        builderState={builderState}
        initialAction={actionToEdit}
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
        }}
        onClose={() => {
          setActionToEdit(null);
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
            <EmptyCallToAction
              label="Add an action"
              onClick={() => {
                setNewActionModalOpen(true);
              }}
            />
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
              <Button
                variant="primary"
                label="Add Action"
                icon={PlusIcon}
                disabled={!allActionsValid}
                onClick={() => {
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
          <DropdownMenu>
            <DropdownMenu.Button tooltipPosition="above">
              <Button
                type="select"
                labelVisible={true}
                label={
                  newAction
                    ? ACTION_TYPE_TO_LABEL[newAction.type]
                    : "Select Action"
                }
                variant="secondary"
                size="sm"
              />
            </DropdownMenu.Button>
            <DropdownMenu.Items origin="topLeft">
              {Object.entries(ACTION_TYPE_TO_LABEL).map(([key, value]) => (
                <DropdownMenu.Item
                  key={key}
                  label={value}
                  onClick={() => {
                    const defaultConfiguration = getDefaultActionConfiguration(
                      key as AssistantBuilderActionConfiguration["type"]
                    );
                    if (!defaultConfiguration) {
                      // Unreachable
                      return;
                    }
                    let index = 1;
                    const suffixedName = () =>
                      index > 1
                        ? `${defaultConfiguration.name}_${index}`
                        : defaultConfiguration.name;
                    while (
                      builderState.actions.some(
                        (a) => a.name === suffixedName()
                      )
                    ) {
                      index += 1;
                    }
                    defaultConfiguration.name = suffixedName();
                    setNewAction(defaultConfiguration);
                  }}
                />
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
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
                onClick={() => deleteAction(initialAction.name)}
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
  return (
    <Hoverable onClick={editAction}>
      <div className="mx-auto inline-block flex w-72 flex-col gap-4 rounded-lg border border-structure-200 px-4 pb-4 pt-2 drop-shadow-md">
        <div className="flex flex-row gap-2 font-semibold text-element-800">
          <Icon visual={ACTION_TYPE_TO_ICON[action.type]} />
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
            default:
              assertNever(action);
          }
        })()}
      </ActionModeSection>
      <div className="flex flex-col gap-4 pt-8">
        <div className="font-semibold text-element-700">Action name</div>
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
        />
        <div className="font-semibold text-element-700">Action description</div>
        <Input
          name="actionDescription"
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
