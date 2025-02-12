import {
  BookOpenIcon,
  Button,
  Card,
  CardActionButton,
  CardGrid,
  Checkbox,
  Chip,
  classNames,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  InformationCircleIcon,
  Input,
  MoreIcon,
  Page,
  PlusIcon,
  Popover,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  ModelConfigurationType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, MAX_STEPS_USE_PER_RUN_LIMIT } from "@dust-tt/types";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import assert from "assert";
import type { ReactNode } from "react";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActionDustAppRun,
  isActionDustAppRunValid as hasErrorActionDustAppRun,
} from "@app/components/assistant_builder/actions/DustAppRunAction";
import {
  ActionGithubCreateIssue,
  ActionGithubGetPullRequest,
  hasErrorActionGithub,
} from "@app/components/assistant_builder/actions/GithubAction";
import {
  ActionProcess,
  hasErrorActionProcess,
} from "@app/components/assistant_builder/actions/ProcessAction";
import { ActionReasoning } from "@app/components/assistant_builder/actions/ReasoningAction";
import {
  ActionRetrievalExhaustive,
  ActionRetrievalSearch,
  hasErrorActionRetrievalExhaustive,
  hasErrorActionRetrievalSearch,
} from "@app/components/assistant_builder/actions/RetrievalAction";
import {
  ActionTablesQuery,
  hasErrorActionTablesQuery,
} from "@app/components/assistant_builder/actions/TablesQueryAction";
import {
  ActionWebNavigation,
  hasErrorActionWebNavigation,
} from "@app/components/assistant_builder/actions/WebNavigationAction";
import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import { isLegacyAssistantBuilderConfiguration } from "@app/components/assistant_builder/legacy_agent";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderActionConfigurationWithId,
  AssistantBuilderPendingAction,
  AssistantBuilderProcessConfiguration,
  AssistantBuilderReasoningConfiguration,
  AssistantBuilderRetrievalConfiguration,
  AssistantBuilderSetActionType,
  AssistantBuilderState,
  AssistantBuilderTableConfiguration,
} from "@app/components/assistant_builder/types";
import {
  getDefaultActionConfiguration,
  isDefaultActionName,
} from "@app/components/assistant_builder/types";
import { ACTION_SPECIFICATIONS } from "@app/lib/api/assistant/actions/utils";

const DATA_SOURCES_ACTION_CATEGORIES = [
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "PROCESS",
  "TABLES_QUERY",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

const ADVANCED_ACTION_CATEGORIES = ["DUST_APP_RUN"] as const satisfies Array<
  AssistantBuilderActionConfiguration["type"]
>;

// Actions in this list are not configurable via the "add tool" menu.
// Instead, they should be handled in the `Capabilities` component.
// Note: not all capabilities are actions (eg: visualization)
const CAPABILITIES_ACTION_CATEGORIES = [
  "WEB_NAVIGATION",
  "GITHUB_GET_PULL_REQUEST",
  "GITHUB_CREATE_ISSUE",
  "REASONING",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

function ActionModeSection({
  children,
  show,
}: {
  children: ReactNode;
  show: boolean;
}) {
  return show && <div className="flex flex-col gap-6">{children}</div>;
}

export function hasActionError(
  action: AssistantBuilderActionConfiguration
): string | null {
  switch (action.type) {
    case "RETRIEVAL_SEARCH":
      return hasErrorActionRetrievalSearch(action);
    case "RETRIEVAL_EXHAUSTIVE":
      return hasErrorActionRetrievalExhaustive(action);
    case "PROCESS":
      return hasErrorActionProcess(action);
    case "DUST_APP_RUN":
      return hasErrorActionDustAppRun(action);
    case "TABLES_QUERY":
      return hasErrorActionTablesQuery(action);
    case "WEB_NAVIGATION":
      return hasErrorActionWebNavigation(action);
    case "GITHUB_GET_PULL_REQUEST":
      return hasErrorActionGithub(action);
    case "GITHUB_CREATE_ISSUE":
      return hasErrorActionGithub(action);
    case "REASONING":
      return null;
    default:
      assertNever(action);
  }
}

function actionDisplayName(action: AssistantBuilderActionConfiguration) {
  return `${ACTION_SPECIFICATIONS[action.type].label}${
    !isDefaultActionName(action) ? " - " + action.name : ""
  }`;
}

type SpaceIdToActions = Record<
  string,
  AssistantBuilderActionConfigurationWithId[]
>;

interface ActionScreenProps {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  setAction: (action: AssistantBuilderSetActionType) => void;
  pendingAction: AssistantBuilderPendingAction;
  enableReasoningTool: boolean;
  reasoningModels: ModelConfigurationType[];
}

export default function ActionsScreen({
  owner,
  builderState,
  setBuilderState,
  setEdited,
  setAction,
  pendingAction,
  enableReasoningTool,
  reasoningModels,
}: ActionScreenProps) {
  const { spaces } = useContext(AssistantBuilderContext);

  const configurableActions = builderState.actions.filter(
    (a) => !(CAPABILITIES_ACTION_CATEGORIES as string[]).includes(a.type)
  );

  const isLegacyConfig = isLegacyAssistantBuilderConfiguration(builderState);

  const spaceIdToActions = useMemo(() => {
    return configurableActions.reduce<
      Record<string, AssistantBuilderActionConfigurationWithId[]>
    >((acc, action) => {
      const addActionToSpace = (spaceId?: string) => {
        if (spaceId) {
          acc[spaceId] = (acc[spaceId] || []).concat(action);
        }
      };

      const actionType = action.type;

      switch (actionType) {
        case "TABLES_QUERY":
          Object.values(action.configuration).forEach((config) => {
            addActionToSpace(config.dataSourceView.spaceId);
          });
          break;

        case "RETRIEVAL_SEARCH":
        case "RETRIEVAL_EXHAUSTIVE":
        case "PROCESS":
          Object.values(action.configuration.dataSourceConfigurations).forEach(
            (config) => {
              addActionToSpace(config.dataSourceView.spaceId);
            }
          );
          break;

        case "DUST_APP_RUN":
          addActionToSpace(action.configuration.app?.space.sId);
          break;

        case "WEB_NAVIGATION":
        case "GITHUB_GET_PULL_REQUEST":
        case "GITHUB_CREATE_ISSUE":
        case "REASONING":
          break;

        default:
          assertNever(actionType);
      }
      return acc;
    }, {});
  }, [configurableActions]);

  const nonGlobalSpacessUsedInActions = useMemo(() => {
    const nonGlobalSpaces = spaces.filter((s) => s.kind !== "global");
    return nonGlobalSpaces.filter((v) => spaceIdToActions[v.sId]?.length > 0);
  }, [spaceIdToActions, spaces]);

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
                id: action.id,
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
        spacesUsedInActions={spaceIdToActions}
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
              <ContentMessage
                title="Update Needed for Your Assistant!"
                icon={InformationCircleIcon}
              >
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
            {configurableActions.length > 0 && !isLegacyConfig && (
              <div>
                <AddAction
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
                  variant="outline"
                  icon={BookOpenIcon}
                  onClick={() => {
                    window.open("https://docs.dust.tt/docs/tools", "_blank");
                  }}
                />
                <AdvancedSettings
                  maxStepsPerRun={builderState.maxStepsPerRun}
                  setMaxStepsPerRun={(maxStepsPerRun) => {
                    setEdited(true);
                    setBuilderState((state) => ({
                      ...state,
                      maxStepsPerRun,
                    }));
                  }}
                  setReasoningModel={
                    enableReasoningTool &&
                    builderState.actions.find((a) => a.type === "REASONING")
                      ? (model) => {
                          setEdited(true);
                          setBuilderState((state) => ({
                            ...state,
                            actions: state.actions.map((a) =>
                              a.type === "REASONING"
                                ? {
                                    ...a,
                                    configuration: {
                                      ...a.configuration,
                                      modelId: model.modelId,
                                      providerId: model.providerId,
                                      reasoningEffort:
                                        model.reasoningEffort ?? null,
                                    },
                                  }
                                : a
                            ),
                          }));
                        }
                      : undefined
                  }
                  reasoningModels={reasoningModels}
                  builderState={builderState}
                />
              </>
            )}
          </div>
        </div>
        {nonGlobalSpacessUsedInActions.length > 0 && (
          <div className="w-full">
            <Chip
              color="amber"
              size="sm"
              label={`Based on the sources you selected, this assistant can only be used by users with access to space${nonGlobalSpacessUsedInActions.length > 1 ? "s" : ""} : ${nonGlobalSpacessUsedInActions.map((v) => v.name).join(", ")}.`}
            />
          </div>
        )}
        <div className="flex h-full min-h-40 flex-col gap-4">
          {configurableActions.length === 0 && (
            <div
              className={classNames(
                "flex h-36 w-full items-center justify-center rounded-xl",
                "bg-muted-background dark:bg-muted-background-night"
              )}
            >
              <AddAction
                onAddAction={(action) => {
                  setAction({
                    type: action.noConfigurationRequired ? "insert" : "pending",
                    action,
                  });
                }}
              />
            </div>
          )}
          <CardGrid>
            {configurableActions.map((a) => (
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
            ))}
          </CardGrid>
        </div>

        <Capabilities
          builderState={builderState}
          setBuilderState={setBuilderState}
          setEdited={setEdited}
          setAction={setAction}
          deleteAction={deleteAction}
          enableReasoningTool={enableReasoningTool}
        />
      </div>
    </>
  );
}

type NewActionModalProps = {
  isOpen: boolean;
  builderState: AssistantBuilderState;
  initialAction: AssistantBuilderActionConfigurationWithId | null;
  spacesUsedInActions: SpaceIdToActions;
  onSave: (newAction: AssistantBuilderActionConfigurationWithId) => void;
  onClose: () => void;
  updateAction: (args: {
    actionName: string;
    getNewActionConfig: (
      old: AssistantBuilderActionConfiguration["configuration"]
    ) => AssistantBuilderActionConfiguration["configuration"];
  }) => void;
  owner: WorkspaceType;
  setEdited: (edited: boolean) => void;
};

function NewActionModal({
  isOpen,
  initialAction,
  spacesUsedInActions,
  onSave,
  onClose,
  owner,
  setEdited,
  builderState,
}: NewActionModalProps) {
  const [newAction, setNewAction] = useState<
    (AssistantBuilderActionConfiguration & { id: string }) | null
  >(null);

  const [showInvalidActionError, setShowInvalidActionError] = useState<
    string | null
  >(null);
  const [showInvalidActionNameError, setShowInvalidActionNameError] = useState<
    string | null
  >(null);
  const [showInvalidActionDescError, setShowInvalidActionDescError] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (initialAction && !newAction) {
      setNewAction(initialAction);
    }
  }, [initialAction, newAction]);

  const titleError =
    initialAction && initialAction?.name !== newAction?.name
      ? getActionNameError(newAction?.name, builderState.actions)
      : null;

  function getActionNameError(
    name: string | undefined,
    existingActions: AssistantBuilderActionConfiguration[]
  ): string | null {
    if (!name || name.trim().length === 0) {
      return "The name cannot be empty.";
    }
    if (existingActions.some((a) => a.name === name)) {
      return "This name is already used for another tool. Please use a different name.";
    }
    if (!/^[a-z0-9_]+$/.test(name)) {
      return "The name can only contain lowercase letters, numbers, and underscores (no spaces).";
    }
    // We reserve the name we use for capability actions, as these aren't
    // configurable via the "add tool" menu.
    const isReservedName = CAPABILITIES_ACTION_CATEGORIES.some(
      (c) => getDefaultActionConfiguration(c)?.name === name
    );
    if (isReservedName) {
      return "This name is reserved for a system tool. Please use a different name.";
    }

    return null;
  }

  const descriptionValid = (newAction?.description?.trim() ?? "").length > 0;

  const onCloseLocal = () => {
    onClose();
    setTimeout(() => {
      setNewAction(null);
      setShowInvalidActionNameError(null);
      setShowInvalidActionDescError(null);
      setShowInvalidActionError(null);
    }, 500);
  };

  const onModalSave = () => {
    if (
      newAction &&
      !titleError &&
      descriptionValid &&
      !hasActionError(newAction)
    ) {
      newAction.name = newAction.name.trim();
      newAction.description = newAction.description.trim();
      onSave(newAction);
      onCloseLocal();
    } else {
      if (titleError) {
        setShowInvalidActionNameError(titleError);
      }
      if (!descriptionValid) {
        setShowInvalidActionDescError("Description cannot be empty.");
      }
      if (newAction) {
        setShowInvalidActionError(hasActionError(newAction));
      }
    }
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onCloseLocal();
        }
      }}
    >
      <SheetContent size="xl">
        <VisuallyHidden>
          <SheetHeader>
            <SheetTitle></SheetTitle>
          </SheetHeader>
        </VisuallyHidden>

        <SheetContainer>
          <div className="w-full pt-8">
            {newAction && (
              <ActionEditor
                action={newAction}
                spacesUsedInActions={spacesUsedInActions}
                updateAction={({
                  actionName,
                  actionDescription,
                  getNewActionConfig,
                }) => {
                  setNewAction({
                    ...newAction,
                    configuration: getNewActionConfig(
                      newAction.configuration
                    ) as any,
                    description: actionDescription,
                    name: actionName,
                  });
                  setShowInvalidActionError(null);
                }}
                owner={owner}
                setEdited={setEdited}
                builderState={builderState}
                showInvalidActionNameError={showInvalidActionNameError}
                showInvalidActionDescError={showInvalidActionDescError}
                showInvalidActionError={showInvalidActionError}
                setShowInvalidActionNameError={setShowInvalidActionNameError}
                setShowInvalidActionDescError={setShowInvalidActionDescError}
              />
            )}
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onCloseLocal,
          }}
          rightButtonProps={{
            label: "Save",
            onClick: onModalSave,
          }}
        />
      </SheetContent>
    </Sheet>
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
  const actionError = hasActionError(action);
  return (
    <Card
      variant="primary"
      onClick={editAction}
      action={
        <CardActionButton
          size="mini"
          icon={XMarkIcon}
          onClick={(e: any) => {
            deleteAction();
            e.stopPropagation();
          }}
        />
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full gap-1 font-medium text-foreground dark:text-foreground-night">
          <Icon
            visual={spec.cardIcon}
            size="sm"
            className="text-foreground dark:text-foreground-night"
          />
          <div className="w-full truncate">{actionDisplayName(action)}</div>
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
          <div className="w-full truncate text-muted-foreground dark:text-muted-foreground-night">
            {actionError ? (
              <span className="text-warning-500">{actionError}</span>
            ) : (
              <>{action.description}</>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

interface ActionConfigEditorProps {
  owner: WorkspaceType;
  action: AssistantBuilderActionConfigurationWithId;
  spacesUsedInActions: SpaceIdToActions;
  instructions: string | null;
  updateAction: (args: {
    actionName: string;
    actionDescription: string;
    getNewActionConfig: (
      old: AssistantBuilderActionConfigurationWithId["configuration"]
    ) => AssistantBuilderActionConfigurationWithId["configuration"];
  }) => void;
  setEdited: (edited: boolean) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
}

function ActionConfigEditor({
  owner,
  action,
  spacesUsedInActions,
  instructions,
  updateAction,
  setEdited,
  description,
  onDescriptionChange,
}: ActionConfigEditorProps) {
  const { spaces } = useContext(AssistantBuilderContext);

  // Only allow one space across all actions.
  const allowedSpaces = useMemo(() => {
    const isSpaceUsedInOtherActions = (space: SpaceType) => {
      const actionsUsingSpace = spacesUsedInActions[space.sId] ?? [];

      return actionsUsingSpace.some((a) => {
        // We use the id to compare actions, as the configuration can change.
        return a.id !== action.id;
      });
    };

    const usedSpacesInOtherActions = spaces.filter(isSpaceUsedInOtherActions);
    if (usedSpacesInOtherActions.length === 0) {
      return spaces;
    }

    return spaces.filter((space) =>
      usedSpacesInOtherActions.some((s) => s.sId === space.sId)
    );
  }, [action, spaces, spacesUsedInActions]);

  switch (action.type) {
    case "DUST_APP_RUN":
      return (
        <ActionDustAppRun
          allowedSpaces={allowedSpaces}
          owner={owner}
          action={action}
          updateAction={updateAction}
          setEdited={setEdited}
        />
      );

    case "RETRIEVAL_SEARCH":
      return (
        <ActionRetrievalSearch
          owner={owner}
          actionConfiguration={action.configuration}
          allowedSpaces={allowedSpaces}
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
          allowedSpaces={allowedSpaces}
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
          allowedSpaces={allowedSpaces}
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
        />
      );

    case "TABLES_QUERY":
      return (
        <ActionTablesQuery
          owner={owner}
          actionConfiguration={action.configuration}
          allowedSpaces={allowedSpaces}
          updateAction={(setNewAction) => {
            updateAction({
              actionName: action.name,
              actionDescription: action.description,
              getNewActionConfig: (old) =>
                setNewAction(old as AssistantBuilderTableConfiguration),
            });
          }}
          setEdited={setEdited}
        />
      );

    case "WEB_NAVIGATION":
      return <ActionWebNavigation />;

    case "GITHUB_GET_PULL_REQUEST":
      return <ActionGithubGetPullRequest />;
    case "GITHUB_CREATE_ISSUE":
      return <ActionGithubCreateIssue />;

    case "REASONING":
      return <ActionReasoning />;

    default:
      assertNever(action);
  }
}

interface ActionEditorProps {
  action: AssistantBuilderActionConfigurationWithId;
  spacesUsedInActions: SpaceIdToActions;
  showInvalidActionNameError: string | null;
  showInvalidActionDescError: string | null;
  showInvalidActionError: string | null;
  setShowInvalidActionNameError: (error: string | null) => void;
  setShowInvalidActionDescError: (error: string | null) => void;
  updateAction: (args: {
    actionName: string;
    actionDescription: string;
    getNewActionConfig: (
      old: AssistantBuilderActionConfiguration["configuration"]
    ) => AssistantBuilderActionConfiguration["configuration"];
  }) => void;
  owner: WorkspaceType;
  setEdited: (edited: boolean) => void;
  builderState: AssistantBuilderState;
}

function ActionEditor({
  action,
  spacesUsedInActions,
  showInvalidActionNameError,
  showInvalidActionDescError,
  showInvalidActionError,
  setShowInvalidActionNameError,
  setShowInvalidActionDescError,
  updateAction,
  owner,
  setEdited,
  builderState,
}: ActionEditorProps) {
  const isDataSourceAction = [
    "TABLES_QUERY",
    "RETRIEVAL_EXHAUSTIVE",
    "RETRIEVAL_SEARCH",
  ].includes(action.type as any);

  const shouldDisplayAdvancedSettings = !["DUST_APP_RUN"].includes(action.type);

  const shouldDisplayDescription = !["DUST_APP_RUN", "PROCESS"].includes(
    action.type
  );

  return (
    <div className="px-1">
      <ActionModeSection show={true}>
        <div className="flex w-full flex-row items-center justify-between px-1">
          <Page.Header
            title={actionDisplayName(action)}
            icon={ACTION_SPECIFICATIONS[action.type].cardIcon}
          />
          {shouldDisplayAdvancedSettings && (
            <Popover
              trigger={<Button icon={MoreIcon} size="sm" variant="ghost" />}
              popoverTriggerAsChild
              content={
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col items-end gap-2">
                    <div className="w-full grow text-sm font-bold text-element-800 dark:text-element-800-night">
                      Name of the tool
                    </div>
                  </div>
                  <Input
                    name="actionName"
                    placeholder="My tool name…"
                    value={action.name}
                    onChange={(e) => {
                      updateAction({
                        actionName: e.target.value.toLowerCase(),
                        actionDescription: action.description,
                        getNewActionConfig: (old) => old,
                      });
                      setShowInvalidActionNameError(null);
                    }}
                    message={showInvalidActionNameError}
                    messageStatus="error"
                    className="text-sm"
                  />
                </div>
              }
            />
          )}
        </div>
        {showInvalidActionNameError && (
          <div className="text-sm text-warning-500">
            {showInvalidActionNameError}
          </div>
        )}

        <ActionConfigEditor
          owner={owner}
          action={action}
          spacesUsedInActions={spacesUsedInActions}
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
            setShowInvalidActionDescError(null);
          }}
        />
        {showInvalidActionError && (
          <div className="text-sm text-warning-500">
            {showInvalidActionError}
          </div>
        )}
      </ActionModeSection>
      {shouldDisplayDescription && (
        <div className="flex flex-col gap-4 pt-8">
          {isDataSourceAction ? (
            <div className="flex flex-col gap-2">
              <div className="font-semibold text-element-800 dark:text-element-800-night">
                What's the data?
              </div>
              <div className="text-sm text-element-600">
                Provide a brief description (maximum 800 characters) of the data
                content and context to help the assistant determine when to
                utilize it effectively.
              </div>
            </div>
          ) : (
            <div className="font-semibold text-element-800 dark:text-element-800-night">
              What is this tool about?
            </div>
          )}
          <TextArea
            placeholder={
              isDataSourceAction ? "This data contains…" : "This tool is about…"
            }
            value={action.description}
            onChange={(e) => {
              if (e.target.value.length < 800) {
                updateAction({
                  actionName: action.name,
                  actionDescription: e.target.value,
                  getNewActionConfig: (old) => old,
                });
                setShowInvalidActionDescError(null);
              }
            }}
            error={showInvalidActionDescError}
            showErrorLabel
          />
        </div>
      )}
    </div>
  );
}

function AdvancedSettings({
  maxStepsPerRun,
  setMaxStepsPerRun,
  reasoningModels,
  setReasoningModel,
  builderState,
}: {
  maxStepsPerRun: number | null;
  setMaxStepsPerRun: (maxStepsPerRun: number | null) => void;
  reasoningModels?: ModelConfigurationType[];
  setReasoningModel: ((model: ModelConfigurationType) => void) | undefined;
  builderState: AssistantBuilderState;
}) {
  const reasoningConfig = builderState.actions.find(
    (a) => a.type === "REASONING"
  )?.configuration as AssistantBuilderReasoningConfiguration | undefined;

  const reasoningModel =
    reasoningModels?.find(
      (m) =>
        m.modelId === reasoningConfig?.modelId &&
        m.providerId === reasoningConfig?.providerId &&
        (m.reasoningEffort ?? null) ===
          (reasoningConfig?.reasoningEffort ?? null)
    ) ?? reasoningModels?.[0];

  return (
    <Popover
      popoverTriggerAsChild
      trigger={
        <Button
          label="Advanced settings"
          variant="outline"
          size="sm"
          isSelect
        />
      }
      content={
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col items-start justify-start">
              <div className="w-full grow text-sm font-bold text-element-800 dark:text-element-800-night">
                Max steps per run
              </div>
              <div className="w-full grow text-sm text-element-600 dark:text-element-600-night">
                up to {MAX_STEPS_USE_PER_RUN_LIMIT}
              </div>
            </div>
            <Input
              value={maxStepsPerRun?.toString() ?? ""}
              placeholder=""
              name="maxStepsPerRun"
              onChange={(e) => {
                if (!e.target.value || e.target.value === "") {
                  setMaxStepsPerRun(null);
                  return;
                }
                const value = parseInt(e.target.value);
                if (
                  !isNaN(value) &&
                  value >= 0 &&
                  value <= MAX_STEPS_USE_PER_RUN_LIMIT
                ) {
                  setMaxStepsPerRun(value);
                }
              }}
            />
            {(reasoningModels?.length ?? 0) > 1 && setReasoningModel && (
              <div className="flex flex-col gap-2">
                <div className="font-semibold text-element-800 dark:text-element-800-night">
                  Reasoning model
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="primary"
                      label={reasoningModel?.displayName}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {(reasoningModels ?? []).map((model) => (
                      <DropdownMenuItem
                        key={model.modelId + (model.reasoningEffort ?? "")}
                        label={model.displayName}
                        onClick={() => setReasoningModel(model)}
                      />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}

interface AddActionProps {
  onAddAction: (action: AssistantBuilderActionConfigurationWithId) => void;
}

function AddAction({ onAddAction }: AddActionProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="primary"
          label="Add a tool"
          data-gtm-label="toolAddingButton"
          data-gtm-location="toolsPanel"
          icon={PlusIcon}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel label="Data Sources" />
          {DATA_SOURCES_ACTION_CATEGORIES.map((key) => {
            const spec = ACTION_SPECIFICATIONS[key];
            const defaultAction = getDefaultActionConfiguration(key);
            if (!defaultAction) {
              return null;
            }

            return (
              <DropdownMenuItem
                key={key}
                onClick={() => onAddAction(defaultAction)}
                icon={spec.dropDownIcon}
                label={spec.label}
                description={spec.description}
              />
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel label="Advanced Actions" />
          {ADVANCED_ACTION_CATEGORIES.map((key) => {
            const spec = ACTION_SPECIFICATIONS[key];
            const defaultAction = getDefaultActionConfiguration(key);
            if (!defaultAction) {
              return null;
            }

            return (
              <DropdownMenuItem
                key={key}
                onClick={() => onAddAction(defaultAction)}
                icon={spec.dropDownIcon}
                label={spec.label}
                description={spec.description}
              />
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Capabilities({
  builderState,
  setBuilderState,
  setEdited,
  setAction,
  deleteAction,
  enableReasoningTool,
}: {
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  setAction: (action: AssistantBuilderSetActionType) => void;
  deleteAction: (name: string) => void;
  enableReasoningTool: boolean;
}) {
  const Capability = ({
    name,
    description,
    enabled,
    onEnable,
    onDisable,
  }: {
    name: string;
    description: string;
    enabled: boolean;
    onEnable: () => void;
    onDisable: () => void;
  }) => {
    return (
      <div className="flex flex-row gap-2">
        <Checkbox
          checked={enabled}
          onCheckedChange={enabled ? onDisable : onEnable}
        />
        <div>
          <div className="flex text-sm font-semibold text-foreground dark:text-foreground-night">
            {name}
          </div>
          <div className="text-sm text-element-700">{description}</div>
        </div>
      </div>
    );
  };

  const { platformActionsConfigurations } = useContext(AssistantBuilderContext);

  const showGithubActions = useMemo(() => {
    if (
      builderState.actions.find((a) => a.type === "GITHUB_GET_PULL_REQUEST")
    ) {
      return true;
    }
    return platformActionsConfigurations.find((c) => c.provider === "github");
  }, [platformActionsConfigurations, builderState]);

  return (
    <>
      <div className="mx-auto grid w-full grid-cols-1 gap-y-4 md:grid-cols-2">
        <Capability
          name="Web search & browse"
          description="Assistant can search (Google) and retrieve information from specific websites."
          enabled={
            !!builderState.actions.find((a) => a.type === "WEB_NAVIGATION")
          }
          onEnable={() => {
            setEdited(true);
            const defaultWebNavigationAction =
              getDefaultActionConfiguration("WEB_NAVIGATION");
            assert(defaultWebNavigationAction);
            setAction({
              type: "insert",
              action: defaultWebNavigationAction,
            });
          }}
          onDisable={() => {
            const defaultWebNavigationAction =
              getDefaultActionConfiguration("WEB_NAVIGATION");
            assert(defaultWebNavigationAction);
            deleteAction(defaultWebNavigationAction.name);
          }}
        />

        <Capability
          name="Data visualization"
          description="Assistant can generate charts and graphs."
          enabled={builderState.visualizationEnabled}
          onEnable={() => {
            setEdited(true);
            setBuilderState((state) => ({
              ...state,
              visualizationEnabled: true,
            }));
          }}
          onDisable={() => {
            setEdited(true);
            setBuilderState((state) => ({
              ...state,
              visualizationEnabled: false,
            }));
          }}
        />

        {enableReasoningTool && (
          <Capability
            name="Reasoning"
            description="Assistant can decide to trigger a reasoning model for complex tasks"
            enabled={!!builderState.actions.find((a) => a.type === "REASONING")}
            onEnable={() => {
              setEdited(true);
              const defaultReasoningAction =
                getDefaultActionConfiguration("REASONING");
              assert(defaultReasoningAction);
              setAction({
                type: "insert",
                action: defaultReasoningAction,
              });
            }}
            onDisable={() => {
              const defaultReasoningAction =
                getDefaultActionConfiguration("REASONING");
              assert(defaultReasoningAction);
              deleteAction(defaultReasoningAction.name);
            }}
          />
        )}
      </div>

      {showGithubActions && (
        <>
          <Page.H variant="h6">Github Actions</Page.H>

          <div className="mx-auto grid w-full grid-cols-1 md:grid-cols-2">
            <Capability
              name="Pull request retrieval"
              description="Assistant can retrieve pull requests by number, including diffs"
              enabled={
                !!builderState.actions.find(
                  (a) => a.type === "GITHUB_GET_PULL_REQUEST"
                )
              }
              onEnable={() => {
                setEdited(true);
                const defaultGithubGetPullRequestAction =
                  getDefaultActionConfiguration("GITHUB_GET_PULL_REQUEST");
                assert(defaultGithubGetPullRequestAction);
                setAction({
                  type: "insert",
                  action: defaultGithubGetPullRequestAction,
                });
              }}
              onDisable={() => {
                const defaulGithubGetPullRequestAction =
                  getDefaultActionConfiguration("GITHUB_GET_PULL_REQUEST");
                assert(defaulGithubGetPullRequestAction);
                deleteAction(defaulGithubGetPullRequestAction.name);
              }}
            />

            <Capability
              name="Issue creation"
              description="Assistant can create issues"
              enabled={
                !!builderState.actions.find(
                  (a) => a.type === "GITHUB_CREATE_ISSUE"
                )
              }
              onEnable={() => {
                setEdited(true);
                const defaultGithubCreateIssueAction =
                  getDefaultActionConfiguration("GITHUB_CREATE_ISSUE");
                assert(defaultGithubCreateIssueAction);
                setAction({
                  type: "insert",
                  action: defaultGithubCreateIssueAction,
                });
              }}
              onDisable={() => {
                const defaulGithubCreateIssueAction =
                  getDefaultActionConfiguration("GITHUB_CREATE_ISSUE");
                assert(defaulGithubCreateIssueAction);
                deleteAction(defaulGithubCreateIssueAction.name);
              }}
            />
          </div>
        </>
      )}
    </>
  );
}
