import {
  BookOpenIcon,
  Button,
  CardButton,
  ContentMessage,
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
import { assertNever, MAX_STEPS_USE_PER_RUN_LIMIT } from "@dust-tt/types";
import type { ReactNode } from "react";
import React, { useCallback, useEffect, useState } from "react";

import {
  ActionDustAppRun,
  isActionDustAppRunValid,
} from "@app/components/assistant_builder/actions/DustAppRunAction";
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
  ActionVisualization,
  isActionVisualizationValid,
} from "@app/components/assistant_builder/actions/VisualizationAction";
import {
  ActionWebNavigation,
  isActionWebsearchValid as isActionWebNavigationValid,
} from "@app/components/assistant_builder/actions/WebNavigationAction";
import { isLegacyAssistantBuilderConfiguration } from "@app/components/assistant_builder/legacy_agent";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderPendingAction,
  AssistantBuilderProcessConfiguration,
  AssistantBuilderRetrievalConfiguration,
  AssistantBuilderSetActionType,
  AssistantBuilderState,
  AssistantBuilderTablesQueryConfiguration,
} from "@app/components/assistant_builder/types";
import { getDefaultActionConfiguration } from "@app/components/assistant_builder/types";
import { ACTION_SPECIFICATIONS } from "@app/lib/api/assistant/actions/utils";
import { classNames } from "@app/lib/utils";

const DATA_SOURCES_ACTION_CATEGORIES = [
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "PROCESS",
  "TABLES_QUERY",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

const CAPABILITIES_ACTION_CATEGORIES = [
  "WEB_NAVIGATION",
  "VISUALIZATION",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

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
    case "WEB_NAVIGATION":
      return isActionWebNavigationValid(action);
    case "VISUALIZATION":
      return isActionVisualizationValid(action);
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
  setAction,
  pendingAction,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  dataSources: DataSourceType[];
  dustApps: AppType[];
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  setAction: (action: AssistantBuilderSetActionType) => void;
  pendingAction: AssistantBuilderPendingAction;
}) {
  const isLegacyConfig = isLegacyAssistantBuilderConfiguration(builderState);

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
        isOpen={pendingAction.action !== null}
        builderState={builderState}
        initialAction={pendingAction.action}
        onSave={(newAction) => {
          setEdited(true);
          if (!pendingAction.action) {
            return;
          }

          let newActionName = newAction.name;

          const isNewActionOrNameChanged =
            !pendingAction.previousActionName ||
            pendingAction.previousActionName !== newActionName;

          // Making sure the name is not used already.
          if (isNewActionOrNameChanged) {
            let index = 2;
            let isNameUsed = builderState.actions.some(
              (a) => a.name === newActionName
            );
            while (isNameUsed) {
              newActionName = `${newAction.name.replace(/_\d+$/, "")}_${index}`;
              index += 1;
              isNameUsed = builderState.actions.some(
                (a) => a.name === newActionName
              );
            }
          }

          if (pendingAction.previousActionName) {
            updateAction({
              actionName: pendingAction.previousActionName,
              newActionName: newActionName,
              newActionDescription: newAction.description,
              getNewActionConfig: () => newAction.configuration,
            });
          } else {
            setAction({
              type: "insert",
              action: {
                ...newAction,
                name: newActionName,
              },
            });
          }
          setAction({ type: "clear_pending" });
        }}
        onClose={() => {
          setAction({ type: "clear_pending" });
        }}
        updateAction={updateAction}
        owner={owner}
        setEdited={setEdited}
        dataSources={dataSources}
        dustApps={dustApps}
      />

      <div className="flex flex-col gap-8 text-sm text-element-700">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Page.Header title="Tools & Data sources" />
            <Page.P>
              <span className="text-sm text-element-700">
                Configure the tools that your assistant is able to use, such as{" "}
                <span className="font-bold">searching</span> in your Data
                Sources or <span className="font-bold">navigating</span> the
                Web.
                <br />
                Before replying, the assistant can use multiple of those tools
                to gather information and provide you with the best possible
                answer.
              </span>
            </Page.P>
          </div>
          <div className="flex flex-row gap-2">
            {isLegacyConfig && (
              <ContentMessage title="Update Needed for Your Assistant!">
                <p>
                  We're enhancing assistants to make them smarter and more
                  versatile. You can now add multiple tools to an assistant,
                  rather than being limited to a single action.
                </p>
                <br />
                <p>Update your assistant to unlock these new capabilities!</p>
              </ContentMessage>
            )}
          </div>
          <div className="flex flex-row gap-2">
            {builderState.actions.length > 0 && !isLegacyConfig && (
              <div>
                <AddAction
                  owner={owner}
                  onAddAction={(action) => {
                    setAction({
                      type: action.noConfigurationRequired
                        ? "insert"
                        : "pending",
                      action,
                    });
                  }}
                />
              </div>
            )}
            {!isLegacyConfig && (
              <>
                <div className="flex-grow" />
                <Button
                  label="Read our guide"
                  size="sm"
                  variant="secondary"
                  icon={BookOpenIcon}
                  onClick={() => {
                    window.open(
                      "https://dust-tt.notion.site/Multi-Actions-Assistants-7c08db0c9cad44559c166401e6afb7e6",
                      "_blank"
                    );
                  }}
                />
                <AdvancedSettings
                  maxStepsPerRun={builderState.maxStepsPerRun}
                  setmaxStepsPerRun={(maxStepsPerRun) => {
                    setEdited(true);
                    setBuilderState((state) => ({
                      ...state,
                      maxStepsPerRun,
                    }));
                  }}
                />
              </>
            )}
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
                onAddAction={(action) => {
                  setAction({
                    type: action.noConfigurationRequired ? "insert" : "pending",
                    action,
                  });
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
                    setAction({
                      type: "edit",
                      action: a,
                    });
                  }}
                  deleteAction={() => {
                    deleteAction(a.name);
                  }}
                  isLegacyConfig={isLegacyConfig}
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
  isLegacyConfig,
}: {
  action: AssistantBuilderActionConfiguration;
  editAction: () => void;
  deleteAction: () => void;
  isLegacyConfig: boolean;
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
        {isLegacyConfig ? (
          <div className="mx-auto">
            <Button
              variant="primary"
              label="Update the description"
              onClick={editAction}
              size="sm"
            />
          </div>
        ) : (
          <div
            className={classNames(
              "w-full truncate text-base",
              action.description ? "text-element-700" : "text-warning-500"
            )}
          >
            {action.description || "Missing description. Click to edit."}
          </div>
        )}
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
    case "WEB_NAVIGATION":
      return <ActionWebNavigation />;
    case "VISUALIZATION":
      return <ActionVisualization />;
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

  const shouldDisplayAdvancedSettings = ![
    "DUST_APP_RUN",
    "WEB_NAVIGATION",
  ].includes(action.type);
  const shouldDisplayDescription = ![
    "DUST_APP_RUN",
    "PROCESS",
    "WEB_NAVIGATION",
  ].includes(action.type);

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
                <DropdownMenu.Items width={320} overflow="visible">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col items-end gap-2">
                      <div className="w-full grow text-sm font-bold text-element-800">
                        Name of the tool
                      </div>
                    </div>
                    <Input
                      name="actionName"
                      placeholder="My tool name…"
                      value={action.name}
                      onChange={(v) => {
                        updateAction({
                          actionName: v.toLowerCase(),
                          actionDescription: action.description,
                          getNewActionConfig: (old) => old,
                        });
                      }}
                      error={
                        !titleValid
                          ? "This name is already used for another tool. Please use a different name."
                          : null
                      }
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
                Provide a brief description of the data content and context.
                This helps the Assistant determine when and how to utilize this
                information source effectively
              </div>
            </div>
          ) : (
            <div className="font-semibold text-element-800">
              What is this tool about?
            </div>
          )}
          <TextArea
            placeholder={
              isDataSourceAction ? "This data contains…" : "This tool is about…"
            }
            value={action.description}
            onChange={(v) => {
              if (v.length < 800) {
                updateAction({
                  actionName: action.name,
                  actionDescription: v,
                  getNewActionConfig: (old) => old,
                });
              }
            }}
            error={!descriptionValid ? "Description cannot be empty." : null}
            showErrorLabel={true}
          />
        </div>
      )}
    </>
  );
}

function AdvancedSettings({
  maxStepsPerRun,
  setmaxStepsPerRun,
}: {
  maxStepsPerRun: number | null;
  setmaxStepsPerRun: (maxStepsPerRun: number | null) => void;
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
                Max steps per run
              </div>
              <div className="w-full grow text-sm text-element-600">
                up to {MAX_STEPS_USE_PER_RUN_LIMIT}
              </div>
            </div>
            <Input
              value={maxStepsPerRun?.toString() ?? ""}
              placeholder=""
              name="maxStepsPerRun"
              onChange={(v) => {
                if (!v || v === "") {
                  setmaxStepsPerRun(null);
                  return;
                }
                const value = parseInt(v);
                if (
                  !isNaN(value) &&
                  value >= 0 &&
                  value <= MAX_STEPS_USE_PER_RUN_LIMIT
                ) {
                  setmaxStepsPerRun(value);
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
  onAddAction,
}: {
  owner: WorkspaceType;
  onAddAction: (action: AssistantBuilderActionConfiguration) => void;
}) {
  const filteredCapabilities = CAPABILITIES_ACTION_CATEGORIES.filter((key) => {
    const flag = ACTION_SPECIFICATIONS[key].flag;
    return !flag || owner.flags.includes(flag);
  });

  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button variant="primary" label="Add a tool" icon={PlusIcon} />
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
              onClick={() => onAddAction(defaultAction)}
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
              onClick={() => onAddAction(defaultAction)}
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
              onClick={() => onAddAction(defaultAction)}
            />
          );
        })}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
