import {
  Button,
  CardButton,
  DropdownMenu,
  Icon,
  IconButton,
  Input,
  Modal,
  MoreIcon,
  Page,
  PlusIcon,
  TextArea,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { AppType, DataSourceType, WorkspaceType } from "@dust-tt/types";
import { assertNever, MAX_TOOLS_USE_PER_RUN_LIMIT } from "@dust-tt/types";
import _ from "lodash";
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
  AssistantBuilderProcessConfiguration,
  AssistantBuilderRetrievalConfiguration,
  AssistantBuilderState,
  AssistantBuilderTablesQueryConfiguration,
} from "@app/components/assistant_builder/types";
import { getDefaultActionConfiguration } from "@app/components/assistant_builder/types";
import { ACTION_SPECIFICATIONS } from "@app/lib/api/assistant/actions/utils";

import {
  ActionDustAppRun,
  isActionDustAppRunValid,
} from "./actions/DustAppRunAction";

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
      />

      <div className="flex min-h-96 flex-col gap-8 text-sm text-element-700">
        <div className="flex flex-col gap-4">
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
          <div className="flex flex-row">
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
            <div className="flex-grow" />
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

        <div className="flex h-full min-h-40 flex-col gap-4">
          {builderState.actions.length === 0 && (
            <div
              className={
                "flex h-full items-center justify-center rounded-lg border border-structure-100 bg-structure-50"
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
          <div className="mx-auto grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {builderState.actions.map((a) => (
              <div className="flex w-full" key={a.name}>
                <ActionCard
                  action={a}
                  key={a.name}
                  editAction={() => {
                    setActionToEdit(a);
                    setNewActionModalOpen(true);
                  }}
                  deleteAction={() => {
                    deleteAction(a.name);
                  }}
                />
              </div>
            ))}
          </div>
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
      title=" "
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
      <div className="w-full pt-8">
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
        </div>
      </div>
    </Modal>
  );
}

function ActionCard({
  action,
  editAction,
  deleteAction,
}: {
  action: AssistantBuilderActionConfiguration;
  editAction: () => void;
  deleteAction: () => void;
}) {
  const spec = ACTION_SPECIFICATIONS[action.type];
  if (!spec) {
    // Unreachable
    return null;
  }
  return (
    <CardButton
      variant="primary"
      onClick={editAction}
      className="mx-auto inline-block w-72"
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full gap-1 font-medium text-element-900">
          <Icon visual={spec.cardIcon} size="sm" className="text-element-900" />
          <div className="w-full truncate">{spec.label}</div>
          <IconButton
            icon={XMarkIcon}
            variant="tertiary"
            size="sm"
            onClick={(e) => {
              deleteAction();
              e.stopPropagation();
            }}
          />
        </div>
        <div className="w-full truncate text-base text-element-700">
          {_.capitalize(_.toLower(action.name).replace(/_/g, " "))}
        </div>
      </div>
    </CardButton>
  );
}

function ActionConfigEditor({
  owner,
  action,
  dustApps,
  dataSources,
  instructions,
  updateAction,
  setEdited,
  description,
  onDescriptionChange,
  isDescriptionValid,
}: {
  owner: WorkspaceType;
  action: AssistantBuilderActionConfiguration;
  dustApps: AppType[];
  dataSources: DataSourceType[];
  instructions: string | null;
  updateAction: (args: {
    actionName: string;
    actionDescription: string;
    getNewActionConfig: (
      old: AssistantBuilderActionConfiguration["configuration"]
    ) => AssistantBuilderActionConfiguration["configuration"];
  }) => void;
  setEdited: (edited: boolean) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  isDescriptionValid: boolean;
}) {
  switch (action.type) {
    case "DUST_APP_RUN":
      return (
        <ActionDustAppRun
          owner={owner}
          action={action}
          dustApps={dustApps}
          updateAction={updateAction}
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
                setNewAction(old as AssistantBuilderRetrievalConfiguration),
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
                setNewAction(old as AssistantBuilderRetrievalConfiguration),
            });
          }}
          setEdited={setEdited}
        />
      );
    case "PROCESS":
      return (
        <ActionProcess
          owner={owner}
          instructions={instructions}
          actionConfiguration={action.configuration}
          dataSources={dataSources}
          updateAction={(setNewAction) => {
            updateAction({
              actionName: action.name,
              actionDescription: action.description,
              getNewActionConfig: (old) =>
                setNewAction(old as AssistantBuilderProcessConfiguration),
            });
          }}
          setEdited={setEdited}
          description={description}
          onDescriptionChange={onDescriptionChange}
          isDescriptionValid={isDescriptionValid}
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
                setNewAction(old as AssistantBuilderTablesQueryConfiguration),
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
  const isDataSourceAction = [
    "TABLES_QUERY",
    "RETRIEVAL_EXHAUSTIVE",
    "RETRIEVAL_SEARCH",
  ].includes(action.type as any);

  const shouldDisplayAdvancedSettings = action.type !== "DUST_APP_RUN";
  const shouldDisplayDescription = !["DUST_APP_RUN", "PROCESS"].includes(
    action.type
  );

  return (
    <>
      <ActionModeSection show={true}>
        <>
          <div className="flex w-full flex-row items-center justify-center justify-between">
            <Page.Header
              title={ACTION_SPECIFICATIONS[action.type].label}
              icon={ACTION_SPECIFICATIONS[action.type].cardIcon}
            />
            {shouldDisplayAdvancedSettings && (
              <DropdownMenu className="pr-2">
                <DropdownMenu.Button>
                  <Button
                    label=""
                    labelVisible={false}
                    icon={MoreIcon}
                    size="sm"
                    variant="tertiary"
                  />
                </DropdownMenu.Button>
                <DropdownMenu.Items width={240} overflow="visible">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col items-end gap-2">
                      <div className="w-full grow text-sm font-bold text-element-800">
                        Name of the action
                      </div>
                    </div>
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
                </DropdownMenu.Items>
              </DropdownMenu>
            )}
          </div>
          <ActionConfigEditor
            owner={owner}
            action={action}
            dustApps={dustApps}
            dataSources={dataSources}
            instructions={builderState.instructions}
            updateAction={updateAction}
            setEdited={setEdited}
            description={action.description}
            onDescriptionChange={(v) => {
              updateAction({
                actionName: action.name,
                actionDescription: v,
                getNewActionConfig: (old) => old,
              });
            }}
            isDescriptionValid={descriptionValid}
          />
        </>
      </ActionModeSection>
      {shouldDisplayDescription && (
        <div className="flex flex-col gap-4 pt-8">
          {isDataSourceAction ? (
            <div className="flex flex-col gap-2">
              <div className="font-semibold text-element-800">
                What's the data?
              </div>
              <div className="text-sm text-element-600">
                Clarify the data's content and context to guide your Assistant
                in determining when and how to utilize it.
              </div>
            </div>
          ) : (
            <div className="font-semibold text-element-800">
              Action description
            </div>
          )}
          <TextArea
            placeholder={
              isDataSourceAction
                ? "This data contains...."
                : "Action description.."
            }
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
      )}
    </>
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
