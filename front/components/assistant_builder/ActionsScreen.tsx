import {
  Avatar,
  BookOpenIcon,
  Button,
  Card,
  CardActionButton,
  CardGrid,
  Chip,
  classNames,
  ContentMessage,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import assert from "assert";
import { uniqueId } from "lodash";
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
  hasErrorActionMCP,
  MCPAction,
} from "@app/components/assistant_builder/actions/MCPAction";
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
  getDefaultMCPServerActionConfiguration,
  isDefaultActionName,
} from "@app/components/assistant_builder/types";
import { getVisual, MCP_SERVER_ICONS } from "@app/lib/actions/mcp_icons";
import { getRequirements } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ACTION_SPECIFICATIONS } from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  ModelConfigurationType,
  SpaceType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import {
  asDisplayName,
  assertNever,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

const DATA_SOURCES_ACTION_CATEGORIES = [
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "PROCESS",
  "TABLES_QUERY",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

const ADVANCED_ACTION_CATEGORIES = [
  "DUST_APP_RUN",
  "MCP",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

// Actions in this list are not configurable via the "add tool" menu.
// Instead, they should be handled in the `Capabilities` component.
// Note: not all capabilities are actions (eg: visualization)
const CAPABILITIES_ACTION_CATEGORIES = [
  "WEB_NAVIGATION",
  "REASONING",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

const isUsableAsCapability = (
  id: string,
  mcpServerViews: MCPServerViewType[]
) => {
  const view = mcpServerViews.find((v) => v.id === id);
  if (!view) {
    return false;
  }
  const requirements = getRequirements(view);
  return view.server.isDefault && requirements.noRequirement;
};

const isUsableInKnowledge = (
  id: string,
  mcpServerViews: MCPServerViewType[]
) => {
  const view = mcpServerViews.find((v) => v.id === id);
  if (!view) {
    return false;
  }
  return view.server.isDefault && !isUsableAsCapability(id, mcpServerViews);
};

// We reserve the name we use for capability actions, as these aren't
// configurable via the "add tool" menu.
const isReservedName = (name: string) =>
  CAPABILITIES_ACTION_CATEGORIES.some(
    (c) => getDefaultActionConfiguration(c)?.name === name
  );

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
  action: AssistantBuilderActionConfiguration,
  mcpServerViews: MCPServerViewType[]
): string | null {
  switch (action.type) {
    case "RETRIEVAL_SEARCH":
      return hasErrorActionRetrievalSearch(action);
    case "RETRIEVAL_EXHAUSTIVE":
      return hasErrorActionRetrievalExhaustive(action);
    case "MCP":
      return hasErrorActionMCP(action, mcpServerViews);
    case "PROCESS":
      return hasErrorActionProcess(action);
    case "DUST_APP_RUN":
      return hasErrorActionDustAppRun(action);
    case "TABLES_QUERY":
      return hasErrorActionTablesQuery(action);
    case "WEB_NAVIGATION":
      return hasErrorActionWebNavigation(action);
    case "REASONING":
      return null;
    default:
      assertNever(action);
  }
}

function actionIcon(
  action: AssistantBuilderActionConfiguration,
  mcpServerViews: MCPServerViewType[]
) {
  if (action.type === "MCP") {
    const server = mcpServerViews.find(
      (v) => v.id === action.configuration.mcpServerViewId
    )?.server;

    if (server) {
      return getVisual(server);
    }
  }
  return React.createElement(ACTION_SPECIFICATIONS[action.type].cardIcon);
}

function actionDisplayName(action: AssistantBuilderActionConfiguration) {
  if (action.type === "MCP") {
    return asDisplayName(action.name);
  }
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
  const { spaces, mcpServerViews } = useContext(AssistantBuilderContext);
  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const isCapabilityAction = useCallback(
    (action: AssistantBuilderActionConfiguration) => {
      if (action.type === "MCP") {
        return isUsableAsCapability(
          action.configuration.mcpServerViewId,
          mcpServerViews
        );
      }

      return (CAPABILITIES_ACTION_CATEGORIES as string[]).includes(action.type);
    },
    [mcpServerViews]
  );

  const configurableActions = builderState.actions.filter(
    (a) => !isCapabilityAction(a)
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

        case "MCP":
          if (action.configuration.dataSourceConfigurations) {
            Object.values(
              action.configuration.dataSourceConfigurations
            ).forEach((config) => {
              addActionToSpace(config.dataSourceView.spaceId);
            });
          }

          if (action.configuration.tablesConfigurations) {
            Object.values(action.configuration.tablesConfigurations).forEach(
              (config) => {
                addActionToSpace(config.dataSourceView.spaceId);
              }
            );
          }

          if (action.configuration.mcpServerViewId) {
            const mcpServerView = mcpServerViews.find(
              (v) => v.id === action.configuration.mcpServerViewId
            );
            // Default MCP server themselves are not accounted for in the space restriction.
            if (mcpServerView && !mcpServerView.server.isDefault) {
              addActionToSpace(mcpServerView.spaceId);
            }
          }
          break;

        case "WEB_NAVIGATION":
        case "REASONING":
          break;

        default:
          assertNever(actionType);
      }
      return acc;
    }, {});
  }, [configurableActions, mcpServerViews]);

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

      <div className="flex flex-col gap-8 text-sm text-muted-foreground dark:text-muted-foreground-night">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Page.Header title="Tools & Data sources" />
            <Page.P>
              <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Configure the tools that your agent is able to use, such as{" "}
                <span className="font-bold">searching</span> in your Data
                Sources or <span className="font-bold">navigating</span> the
                Web.
                <br />
                Before replying, the agent can use multiple of those tools to
                gather information and provide you with the best possible
                answer.
              </span>
            </Page.P>
          </div>
          <div className="flex flex-row gap-2">
            {isLegacyConfig && (
              <ContentMessage
                title="Update Needed for Your Agent!"
                icon={InformationCircleIcon}
              >
                <p>
                  We're enhancing agents to make them smarter and more
                  versatile. You can now add multiple tools to an agent, rather
                  than being limited to a single action.
                </p>
                <br />
                <p>Update your agent to unlock these new capabilities!</p>
              </ContentMessage>
            )}
          </div>
          <div className="flex flex-row gap-2">
            {configurableActions.length > 0 && !isLegacyConfig && (
              <AddAction
                mcpServerViews={mcpServerViews}
                onAddAction={(action) => {
                  setAction({
                    type: action.noConfigurationRequired ? "insert" : "pending",
                    action,
                  });
                }}
                hasFeature={hasFeature}
              />
            )}
            <Capabilities
              builderState={builderState}
              setBuilderState={setBuilderState}
              setEdited={setEdited}
              setAction={setAction}
              deleteAction={deleteAction}
              enableReasoningTool={enableReasoningTool}
            />

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
              color="info"
              size="sm"
              label={`Based on the sources you selected, this agent can only be used by users with access to space${nonGlobalSpacessUsedInActions.length > 1 ? "s" : ""} : ${nonGlobalSpacessUsedInActions.map((v) => v.name).join(", ")}.`}
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
                mcpServerViews={mcpServerViews}
                onAddAction={(action) => {
                  setAction({
                    type: action.noConfigurationRequired ? "insert" : "pending",
                    action,
                  });
                }}
                hasFeature={hasFeature}
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
  const [newActionConfig, setNewActionConfig] = useState<
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

  const { mcpServerViews } = useContext(AssistantBuilderContext);

  useEffect(() => {
    if (initialAction && !newActionConfig) {
      setNewActionConfig(initialAction);
    }
  }, [initialAction, newActionConfig]);

  const titleError =
    initialAction && initialAction?.name !== newActionConfig?.name
      ? getActionNameError(newActionConfig?.name, builderState.actions)
      : null;

  function getActionNameError(
    name: string | undefined,
    existingActions: AssistantBuilderActionConfiguration[]
  ): string | null {
    if (!name || name.trim().length === 0) {
      return "The name cannot be empty.";
    }
    if (existingActions.some((a) => a.name === name)) {
      return 'This name is already used for another tool. Use the "..." button to rename it.';
    }
    if (!/^[a-z0-9_]+$/.test(name)) {
      return "The name can only contain lowercase letters, numbers, and underscores (no spaces).";
    }

    if (isReservedName(name)) {
      return "This name is reserved for a system tool. Please use a different name.";
    }

    return null;
  }

  const descriptionValid =
    (newActionConfig?.description?.trim() ?? "").length > 0;

  const onCloseLocal = useCallback(() => {
    onClose();
    setTimeout(() => {
      setNewActionConfig(null);
      setShowInvalidActionNameError(null);
      setShowInvalidActionDescError(null);
      setShowInvalidActionError(null);
    }, 500);
  }, [onClose]);

  const onModalSave = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (
        newActionConfig &&
        !titleError &&
        descriptionValid &&
        !hasActionError(newActionConfig, mcpServerViews)
      ) {
        newActionConfig.name = newActionConfig.name.trim();
        newActionConfig.description = newActionConfig.description.trim();
        onSave(newActionConfig);
        onCloseLocal();
      } else {
        if (titleError) {
          setShowInvalidActionNameError(titleError);
        }
        if (!descriptionValid) {
          setShowInvalidActionDescError("Description cannot be empty.");
        }
        if (newActionConfig) {
          setShowInvalidActionError(
            hasActionError(newActionConfig, mcpServerViews)
          );
        }
      }
    },
    [
      newActionConfig,
      onCloseLocal,
      onSave,
      titleError,
      descriptionValid,
      mcpServerViews,
    ]
  );

  const updateAction = useCallback(
    ({
      actionName,
      actionDescription,
      getNewActionConfig,
    }: {
      actionName: string;
      actionDescription: string;
      getNewActionConfig: (
        old: AssistantBuilderActionConfiguration["configuration"]
      ) => AssistantBuilderActionConfiguration["configuration"];
    }) => {
      setNewActionConfig((prev) => {
        if (!prev) {
          return null;
        }
        return {
          ...prev,
          configuration: getNewActionConfig(prev.configuration) as any,
          description: actionDescription,
          name: actionName,
        };
      });
      setShowInvalidActionError(null);
    },
    []
  );

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
            {newActionConfig && (
              <ActionEditor
                action={newActionConfig}
                spacesUsedInActions={spacesUsedInActions}
                updateAction={updateAction}
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
  const { mcpServerViews } = useContext(AssistantBuilderContext);
  const spec = ACTION_SPECIFICATIONS[action.type];
  if (!spec) {
    // Unreachable
    return null;
  }

  const actionError = hasActionError(action, mcpServerViews);
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
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          <Avatar size="xs" visual={actionIcon(action, mcpServerViews)} />
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
          updateAction={(setNewActionConfig) => {
            updateAction({
              actionName: action.name,
              actionDescription: action.description,
              getNewActionConfig: (old) =>
                setNewActionConfig(
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
          allowedSpaces={allowedSpaces}
          updateAction={(setNewActionConfig) => {
            updateAction({
              actionName: action.name,
              actionDescription: action.description,
              getNewActionConfig: (old) =>
                setNewActionConfig(
                  old as AssistantBuilderRetrievalConfiguration
                ),
            });
          }}
          setEdited={setEdited}
        />
      );

    case "MCP":
      return (
        <MCPAction
          owner={owner}
          action={action}
          allowedSpaces={allowedSpaces}
          updateAction={updateAction}
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
          updateAction={(setNewActionConfig) => {
            updateAction({
              actionName: action.name,
              actionDescription: action.description,
              getNewActionConfig: (old) =>
                setNewActionConfig(old as AssistantBuilderProcessConfiguration),
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
          updateAction={(setNewActionConfig) => {
            updateAction({
              actionName: action.name,
              actionDescription: action.description,
              getNewActionConfig: (old) =>
                setNewActionConfig(old as AssistantBuilderTableConfiguration),
            });
          }}
          setEdited={setEdited}
        />
      );

    case "WEB_NAVIGATION":
      return <ActionWebNavigation />;

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
  const { mcpServerViews } = useContext(AssistantBuilderContext);

  const isActionWithDataSource = useMemo(() => {
    const actionType = action.type;
    switch (actionType) {
      case "DUST_APP_RUN":
      case "PROCESS":
      case "REASONING":
      case "WEB_NAVIGATION":
        return false;
      case "TABLES_QUERY":
      case "RETRIEVAL_EXHAUSTIVE":
      case "RETRIEVAL_SEARCH":
        return true;
      case "MCP":
        const selectedMCPServerView = mcpServerViews.find((mcpServerView) =>
          action.type === "MCP"
            ? mcpServerView.id === action.configuration.mcpServerViewId
            : false
        );

        const requirements = getRequirements(selectedMCPServerView);
        return (
          requirements.requiresDataSourceConfiguration ||
          requirements.requiresTableConfiguration
        );
      default:
        assertNever(actionType);
    }
  }, [action.type, action.configuration, mcpServerViews]);

  const shouldDisplayAdvancedSettings = !["DUST_APP_RUN"].includes(action.type);

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
                    <div className="w-full grow text-sm font-bold text-muted-foreground dark:text-muted-foreground-night">
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
      {isActionWithDataSource && (
        <div className="flex flex-col gap-4 pt-8">
          <div className="flex flex-col gap-2">
            <div className="font-semibold text-muted-foreground dark:text-muted-foreground-night">
              What's the data?
            </div>
            <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Provide a brief description (maximum 800 characters) of the data
              content and context to help the agent determine when to utilize it
              effectively.
            </div>
          </div>
          <TextArea
            placeholder={"This data contains…"}
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
              <div className="w-full grow text-sm font-bold text-muted-foreground dark:text-muted-foreground-night">
                Max steps per run
              </div>
              <div className="w-full grow text-sm text-muted-foreground dark:text-muted-foreground-night">
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
                <div className="font-semibold text-muted-foreground dark:text-muted-foreground-night">
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
  mcpServerViews: MCPServerViewType[];
  onAddAction: (action: AssistantBuilderActionConfigurationWithId) => void;
  hasFeature: (feature: WhitelistableFeature | null | undefined) => boolean;
}

function AddAction({
  mcpServerViews,
  onAddAction,
  hasFeature,
}: AddActionProps) {
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
          <DropdownMenuLabel label="Knowledge" />
          {DATA_SOURCES_ACTION_CATEGORIES.map((key) => {
            const spec = ACTION_SPECIFICATIONS[key];
            if (!hasFeature(spec.flag)) {
              return null;
            }
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
          {mcpServerViews
            .filter((view) => isUsableInKnowledge(view.id, mcpServerViews))
            .map((view) => {
              return (
                <DropdownMenuItem
                  key={view.id}
                  icon={MCP_SERVER_ICONS["command"]}
                  label={asDisplayName(view.server.name)}
                  description={view.server.description}
                  onClick={() =>
                    onAddAction({
                      ...getDefaultMCPServerActionConfiguration(view),
                      id: uniqueId(),
                    })
                  }
                />
              );
            })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel label="Advanced" />
          {ADVANCED_ACTION_CATEGORIES.map((key) => {
            const spec = ACTION_SPECIFICATIONS[key];
            if (!hasFeature(spec.flag)) {
              return null;
            }
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
  const { mcpServerViews } = useContext(AssistantBuilderContext);

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
      <DropdownMenuCheckboxItem
        checked={enabled}
        onCheckedChange={enabled ? onDisable : onEnable}
        className="mb-0 mt-0 pb-0 pr-0 pt-0"
      >
        <DropdownMenuItem label={name} description={description} />
      </DropdownMenuCheckboxItem>
    );
  };

  // Default servers with no configuration requirements are usable as capabilities
  const mcpServerViewsCapabilities = useMemo(() => {
    return mcpServerViews.filter((view) =>
      isUsableAsCapability(view.id, mcpServerViews)
    );
  }, [mcpServerViews]);

  const isWebNavigationEnabled = useMemo(() => {
    return !!builderState.actions.find((a) => a.type === "WEB_NAVIGATION");
  }, [builderState.actions]);

  const isReasoningEnabled = useMemo(() => {
    return !!builderState.actions.find((a) => a.type === "REASONING");
  }, [builderState.actions]);

  const totalCapabilities = useMemo(() => {
    let total = 0;
    if (isWebNavigationEnabled) {
      total++;
    }
    if (isReasoningEnabled) {
      total++;
    }
    if (builderState.visualizationEnabled) {
      total++;
    }

    for (const view of mcpServerViewsCapabilities) {
      if (
        builderState.actions.find(
          (a) => a.type === "MCP" && a.configuration.mcpServerViewId === view.id
        )
      ) {
        total++;
      }
    }

    return total;
  }, [
    isWebNavigationEnabled,
    isReasoningEnabled,
    builderState.visualizationEnabled,
    mcpServerViewsCapabilities,
    builderState.actions,
  ]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          label={
            totalCapabilities
              ? `Capabilities (${totalCapabilities})`
              : "Capabilities"
          }
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <Capability
          name="Web search & browse"
          description="Agent can search (Google) and retrieve information from specific websites."
          enabled={isWebNavigationEnabled}
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
          description="Agent can generate charts and graphs."
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
            description="Agent can decide to trigger a reasoning model for complex tasks"
            enabled={isReasoningEnabled}
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

        {mcpServerViewsCapabilities.map((view) => {
          return (
            <Capability
              key={view.id}
              name={asDisplayName(view.server.name)}
              description={view.server.description}
              enabled={
                !!builderState.actions.find(
                  (a) =>
                    a.type === "MCP" &&
                    a.configuration.mcpServerViewId === view.id
                )
              }
              onEnable={() => {
                setEdited(true);
                const action = getDefaultMCPServerActionConfiguration(view);
                assert(action);
                setAction({
                  type: "insert",
                  action: {
                    ...action,
                    id: uniqueId(),
                  },
                });
              }}
              onDisable={() => {
                const action = getDefaultMCPServerActionConfiguration(view);
                assert(action);
                deleteAction(action.name);
              }}
            />
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
