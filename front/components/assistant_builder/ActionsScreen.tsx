import {
  Button,
  DropdownMenu,
  Input,
  Modal,
  Page,
  PlusIcon,
} from "@dust-tt/sparkle";
import type { AppType, DataSourceType, WorkspaceType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { ReactNode } from "react";
import React, { useCallback, useState } from "react";

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
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import { getDefaultActionConfiguration } from "@app/components/assistant_builder/types";

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

  const upsertAction = useCallback(
    (newAction: AssistantBuilderActionConfiguration) => {
      setBuilderState((state) => {
        let found = false;
        const newActions = state.actions.map((action) => {
          if (action.name === newAction.name) {
            found = true;
            return newAction;
          }
          return action;
        });
        if (!found) {
          newActions.push(newAction);
        }
        return {
          ...state,
          actions: newActions,
        };
      });
    },
    [setBuilderState]
  );

  const allActionsValid = builderState.actions.every(isActionValid);

  return (
    <>
      <NewActionModal
        isOpen={newActionModalOpen}
        setOpen={setNewActionModalOpen}
        builderState={builderState}
        onSave={(newAction) => {
          upsertAction(newAction);
          setNewActionModalOpen(false);
        }}
      />
      <div className="flex flex-col gap-8 text-sm text-element-700">
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

        <div className="flex flex-col gap-8">
          {builderState.actions.map((a) => (
            <div key={a.name}>
              <Page.SectionHeader title={a.name} />
              <Page.P>{a.description}</Page.P>
              <div className="py-8">
                <ActionModeSection show={true}>
                  {(() => {
                    switch (a.type) {
                      case "DUST_APP_RUN":
                        return (
                          <ActionDustAppRun
                            owner={owner}
                            actionConfigration={a.configuration}
                            dustApps={dustApps}
                            updateAction={(newAction) => {
                              upsertAction({
                                ...a,
                                configuration: newAction,
                              });
                            }}
                            setEdited={setEdited}
                          />
                        );
                      case "RETRIEVAL_SEARCH":
                        return (
                          <ActionRetrievalSearch
                            owner={owner}
                            actionConfiguration={a.configuration}
                            dataSources={dataSources}
                            updateAction={(newAction) => {
                              upsertAction({
                                ...a,
                                configuration: newAction,
                              });
                            }}
                            setEdited={setEdited}
                          />
                        );
                      case "RETRIEVAL_EXHAUSTIVE":
                        return (
                          <ActionRetrievalExhaustive
                            owner={owner}
                            actionConfiguration={a.configuration}
                            dataSources={dataSources}
                            updateAction={(newAction) => {
                              upsertAction({
                                ...a,
                                configuration: newAction,
                              });
                            }}
                            setEdited={setEdited}
                          />
                        );
                      case "PROCESS":
                        return (
                          <ActionProcess
                            owner={owner}
                            actionConfiguration={a.configuration}
                            dataSources={dataSources}
                            updateAction={(newAction) => {
                              upsertAction({
                                ...a,
                                configuration: newAction,
                              });
                            }}
                            setEdited={setEdited}
                          />
                        );
                      case "TABLES_QUERY":
                        return (
                          <ActionTablesQuery
                            owner={owner}
                            actionConfiguration={a.configuration}
                            dataSources={dataSources}
                            updateAction={(newAction) => {
                              upsertAction({
                                ...a,
                                configuration: newAction,
                              });
                            }}
                            setEdited={setEdited}
                          />
                        );
                      default:
                        assertNever(a);
                    }
                  })()}
                </ActionModeSection>
              </div>
              <Page.Separator />
            </div>
          ))}

          <div className="pt-8">
            <Button
              variant="secondary"
              label="Add Action"
              icon={PlusIcon}
              disabled={!allActionsValid}
              onClick={() => {
                setNewActionModalOpen(true);
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function NewActionModal({
  isOpen,
  setOpen,
  builderState,
  onSave,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  builderState: AssistantBuilderState;
  onSave: (newAction: AssistantBuilderActionConfiguration) => void;
}) {
  const [newAction, setNewAction] =
    useState<AssistantBuilderActionConfiguration | null>(null);

  const titleValid =
    (newAction?.name?.trim() ?? "").length > 0 &&
    !builderState.actions.some((a) => a.name === newAction?.name);

  const descriptionValid = (newAction?.description?.trim() ?? "").length > 0;

  const onClose = () => {
    setOpen(false);
    setTimeout(() => {
      setNewAction(null);
    }, 500);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hasChanged={true}
      variant="side-md"
      title="Add Action"
      onSave={
        newAction && titleValid && descriptionValid
          ? () => {
              newAction.name = newAction.name.trim();
              newAction.description = newAction.description.trim();
              onSave(newAction);
              onClose();
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
                        ? `${defaultConfiguration.name} (${index})`
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
          {newAction ? (
            <>
              <Input
                name="actionName"
                placeholder="My action name.."
                value={newAction?.name ?? null}
                onChange={(v) => {
                  setNewAction({
                    ...newAction,
                    name: v,
                  });
                }}
                error={!titleValid ? "Name already exists" : null}
              />
              <Input
                name="actionDescription"
                placeholder="My action description.."
                value={newAction?.description ?? null}
                onChange={(v) => {
                  setNewAction({
                    ...newAction,
                    description: v,
                  });
                }}
              />
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
