import {
  Avatar,
  BookOpenIcon,
  Button,
  Card,
  CardActionButton,
  CardGrid,
  Chip,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Hoverable,
  InformationCircleIcon,
  Input,
  MoreIcon,
  Page,
  Popover,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
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

import { MCPActionHeader } from "@app/components/actions/MCPActionHeader";
import { DataVisualization } from "@app/components/assistant_builder/actions/DataVisualization";
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
import { AddToolsDropdown } from "@app/components/assistant_builder/AddToolsDropdown";
import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import { isLegacyAssistantBuilderConfiguration } from "@app/components/assistant_builder/legacy_agent";
import type {
  AssistantBuilderActionAndDataVisualizationConfiguration,
  AssistantBuilderActionConfiguration,
  AssistantBuilderActionConfigurationWithId,
  AssistantBuilderActionState,
  AssistantBuilderPendingAction,
  AssistantBuilderProcessConfiguration,
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
import {
  isReservedName,
  useBuilderActionInfo,
} from "@app/components/assistant_builder/useBuilderActionInfo";
import { useTools } from "@app/components/assistant_builder/useTools";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  ACTION_SPECIFICATIONS,
  DATA_VISUALIZATION_SPECIFICATION,
} from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServerConnections } from "@app/lib/swr/mcp_servers";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  SpaceType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import {
  asDisplayName,
  assertNever,
  EXTENDED_MAX_STEPS_USE_PER_RUN_LIMIT,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";
import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";

import { DataDescription } from "./actions/DataDescription";

const DATA_SOURCES_ACTION_CATEGORIES = [
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "PROCESS",
  "TABLES_QUERY",
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
  action: AssistantBuilderActionAndDataVisualizationConfiguration,
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
    case "DATA_VISUALIZATION":
      return null;
    default:
      assertNever(action);
  }
}

function actionIcon(
  action: AssistantBuilderActionAndDataVisualizationConfiguration,
  mcpServerView: MCPServerViewType | null
) {
  if (mcpServerView?.server) {
    return getAvatar(mcpServerView.server, "xs");
  }

  if (action.type === "DATA_VISUALIZATION") {
    return (
      <Avatar icon={DATA_VISUALIZATION_SPECIFICATION.cardIcon} size="xs" />
    );
  }

  return (
    <Avatar icon={ACTION_SPECIFICATIONS[action.type].cardIcon} size="xs" />
  );
}

function actionDisplayName(
  action: AssistantBuilderActionAndDataVisualizationConfiguration,
  mcpServerView: MCPServerViewType | null
) {
  if (mcpServerView && action.type === "MCP") {
    return getMcpServerViewDisplayName(mcpServerView, action);
  }

  if (action.type === "DATA_VISUALIZATION") {
    return asDisplayName(action.name);
  }

  return `${ACTION_SPECIFICATIONS[action.type].label}${
    !isDefaultActionName(action) ? " - " + action.name : ""
  }`;
}

type SpaceIdToActions = Record<string, AssistantBuilderActionState[]>;

interface ActionScreenProps {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  setAction: (action: AssistantBuilderSetActionType) => void;
  pendingAction: AssistantBuilderPendingAction;
  isFetchingActions: boolean;
}

export default function ActionsScreen({
  owner,
  builderState,
  setBuilderState,
  setEdited,
  setAction,
  pendingAction,
  isFetchingActions = false,
}: ActionScreenProps) {
  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const isLegacyConfig = isLegacyAssistantBuilderConfiguration(builderState);

  const { nonGlobalSpacesUsedInActions, spaceIdToActions } =
    useBuilderActionInfo(builderState);

  const {
    mcpServerViewsWithKnowledge,
    selectableNonMCPActions,
    selectableDefaultMCPServerViews,
    selectableNonDefaultMCPServerViews,
  } = useTools({
    actions: builderState.actions,
  });

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
                ...action,
                name: newActionName ?? action.name,
                description: newActionDescription ?? action.description,
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

  const removeAction = useCallback(
    (selectedAction: AssistantBuilderActionState) => {
      setEdited(true);
      setBuilderState((state) => {
        return {
          ...state,
          actions: state.actions.filter(
            (action) => action.name !== selectedAction.name
          ),
          // We include DATA_VISUALIZATION in the actions list, but it's not a real action.
          // It's a boolean value (visualizationEnabled) so we need to set it to false here.
          visualizationEnabled:
            selectedAction.type === "DATA_VISUALIZATION"
              ? false
              : state.visualizationEnabled,
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
        isEditing={!!pendingAction.previousActionName}
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
                <br />
                Need help? Check out our{" "}
                <Hoverable
                  variant="highlight"
                  href="https://docs.dust.tt/docs/data"
                  target="_blank"
                >
                  guide
                </Hoverable>
                .
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
          {!isLegacyConfig && (
            <div className="flex flex-row gap-2">
              <AddKnowledgeDropdown
                hasFeature={hasFeature}
                setAction={setAction}
                mcpServerViewsWithKnowledge={mcpServerViewsWithKnowledge}
              />
              <AddToolsDropdown
                setBuilderState={setBuilderState}
                setEdited={setEdited}
                setAction={setAction}
                nonDefaultMCPActions={selectableNonMCPActions}
                defaultMCPServerViews={selectableDefaultMCPServerViews}
                nonDefaultMCPServerViews={selectableNonDefaultMCPServerViews}
              />

              <div className="flex-grow" />
              <AdvancedSettings
                maxStepsPerRun={builderState.maxStepsPerRun}
                setMaxStepsPerRun={(maxStepsPerRun) => {
                  setEdited(true);
                  setBuilderState((state) => ({
                    ...state,
                    maxStepsPerRun,
                  }));
                }}
                hasFeature={hasFeature}
              />
            </div>
          )}
        </div>
        {nonGlobalSpacesUsedInActions.length > 0 && (
          <div className="w-full">
            <Chip
              color="info"
              size="sm"
              label={`Based on the sources you selected, this agent can only be used by users with access to space${nonGlobalSpacesUsedInActions.length > 1 ? "s" : ""} : ${nonGlobalSpacesUsedInActions.map((v) => v.name).join(", ")}.`}
            />
          </div>
        )}
        <div className="flex h-full min-h-40 flex-col gap-4">
          {isFetchingActions && (
            <div className="flex h-36 w-full items-center justify-center rounded-xl">
              <Spinner />
            </div>
          )}
          {!isFetchingActions &&
            (!isLegacyConfig && builderState.actions.length === 0 ? (
              <div className="flex h-36 w-full items-center justify-center rounded-xl bg-muted-background dark:bg-muted-background-night">
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Add knowledge and tools to enhance your agent's capabilities.
                </p>
              </div>
            ) : (
              <CardGrid>
                {builderState.actions.map((action) => (
                  <ActionCard
                    action={action}
                    key={action.name}
                    editAction={() => {
                      setAction({
                        type: "edit",
                        action,
                      });
                    }}
                    removeAction={() => {
                      removeAction(action);
                    }}
                    isLegacyConfig={isLegacyConfig}
                  />
                ))}
              </CardGrid>
            ))}
        </div>
      </div>
    </>
  );
}

type NewActionModalProps = {
  isOpen: boolean;
  builderState: AssistantBuilderState;
  initialAction: AssistantBuilderActionState | null;
  isEditing: boolean;
  spacesUsedInActions: SpaceIdToActions;
  onSave: (newAction: AssistantBuilderActionState) => void;
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
  isEditing,
  spacesUsedInActions,
  onSave,
  onClose,
  owner,
  setEdited,
  builderState,
}: NewActionModalProps) {
  const [newActionConfig, setNewActionConfig] =
    useState<AssistantBuilderActionState | null>(null);

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
    existingActions: AssistantBuilderActionAndDataVisualizationConfiguration[]
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
      <SheetContent size="lg">
        <VisuallyHidden>
          <SheetHeader>
            <SheetTitle></SheetTitle>
          </SheetHeader>
        </VisuallyHidden>

        <SheetContainer>
          <div className="w-full">
            {newActionConfig && (
              <ActionEditor
                action={newActionConfig}
                isEditing={isEditing}
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
            label: initialAction?.noConfigurationRequired ? "Close" : "Save",
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
  removeAction,
  isLegacyConfig,
}: {
  action: AssistantBuilderActionAndDataVisualizationConfiguration;
  editAction: () => void;
  removeAction: () => void;
  isLegacyConfig: boolean;
}) {
  const { mcpServerViews } = useContext(AssistantBuilderContext);
  const spec =
    action.type === "DATA_VISUALIZATION"
      ? DATA_VISUALIZATION_SPECIFICATION
      : ACTION_SPECIFICATIONS[action.type];

  if (!spec) {
    // Unreachable
    return null;
  }

  const mcpServerView =
    action.type === "MCP"
      ? mcpServerViews.find(
          (mcpServerView) =>
            mcpServerView.sId === action.configuration.mcpServerViewId
        ) ?? null
      : null;

  const actionError = hasActionError(action, mcpServerViews);
  return (
    <Card
      variant="primary"
      className="max-h-40"
      onClick={editAction}
      action={
        <CardActionButton
          size="mini"
          icon={XMarkIcon}
          onClick={(e: any) => {
            removeAction();
            e.stopPropagation();
          }}
        />
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          {actionIcon(action, mcpServerView)}
          <div className="w-full truncate">
            {actionDisplayName(action, mcpServerView)}
          </div>
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
          <div className="line-clamp-4 text-muted-foreground dark:text-muted-foreground-night">
            {actionError ? (
              <span className="text-warning-500">{actionError}</span>
            ) : (
              <p>{action.description}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

interface ActionConfigEditorProps {
  owner: WorkspaceType;
  action: AssistantBuilderActionState;
  isEditing: boolean;
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
  setShowInvalidActionDescError: (
    showInvalidActionDescError: string | null
  ) => void;
  showInvalidActionDescError: string | null;
}

function ActionConfigEditor({
  owner,
  action,
  isEditing,
  spacesUsedInActions,
  instructions,
  updateAction,
  setEdited,
  description,
  onDescriptionChange,
  setShowInvalidActionDescError,
  showInvalidActionDescError,
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
          isEditing={isEditing}
          allowedSpaces={allowedSpaces}
          updateAction={updateAction}
          setEdited={setEdited}
          setShowInvalidActionDescError={setShowInvalidActionDescError}
          showInvalidActionDescError={showInvalidActionDescError}
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

    case "DATA_VISUALIZATION":
      return <DataVisualization />;

    default:
      assertNever(action);
  }
}

interface ActionEditorProps {
  action: AssistantBuilderActionState;
  isEditing: boolean;
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
  isEditing,
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

  const selectedMCPServerView =
    action.type === "MCP"
      ? mcpServerViews.find(
          (mcpServerView) =>
            mcpServerView.sId === action.configuration.mcpServerViewId
        )
      : undefined;

  const { connections, isConnectionsLoading } = useMCPServerConnections({
    owner,
    connectionType: "workspace",
    disabled: !selectedMCPServerView?.server.authorization,
  });

  const isConnected = connections.some(
    (c) =>
      c.internalMCPServerId === selectedMCPServerView?.server.sId ||
      c.remoteMCPServerId === selectedMCPServerView?.server.sId
  );

  // This is to show the data description input.
  // For MCP, to show it before the tool section, we handle it in
  // MCPAction component.
  const isDefaultActionWithDataSource = useMemo(() => {
    const actionType = action.type;
    switch (actionType) {
      case "DUST_APP_RUN":
      case "PROCESS":
      case "REASONING":
      case "WEB_NAVIGATION":
      case "DATA_VISUALIZATION":
        return false;
      case "TABLES_QUERY":
      case "RETRIEVAL_EXHAUSTIVE":
      case "RETRIEVAL_SEARCH":
        return true;
      case "MCP":
        return false;

      default:
        assertNever(actionType);
    }
  }, [action.type]);

  const shouldDisplayAdvancedSettings = !["DUST_APP_RUN"].includes(action.type);

  return (
    <div className="flex flex-col gap-4 px-1">
      <ActionModeSection show={true}>
        <div className="flex w-full flex-row items-center justify-between px-1">
          {action.type === "MCP" && selectedMCPServerView ? (
            <MCPActionHeader
              mcpServer={selectedMCPServerView.server}
              isAuthorized={Boolean(selectedMCPServerView.server.authorization)}
              isConnected={isConnected}
              isConnectionsLoading={isConnectionsLoading}
              action={action}
            />
          ) : (
            <div className="flex items-center gap-3">
              <Avatar
                icon={
                  action.type === "DATA_VISUALIZATION"
                    ? DATA_VISUALIZATION_SPECIFICATION.cardIcon
                    : ACTION_SPECIFICATIONS[action.type].cardIcon
                }
              />
              <h2 className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">
                {actionDisplayName(action, selectedMCPServerView ?? null)}
              </h2>
            </div>
          )}

          {shouldDisplayAdvancedSettings && !action.noConfigurationRequired && (
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
          isEditing={isEditing}
          spacesUsedInActions={spacesUsedInActions}
          instructions={builderState.instructions}
          updateAction={updateAction}
          setEdited={setEdited}
          description={action.description}
          setShowInvalidActionDescError={setShowInvalidActionDescError}
          showInvalidActionDescError={showInvalidActionDescError}
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
      {isDefaultActionWithDataSource && (
        <DataDescription
          updateAction={updateAction}
          action={action}
          setShowInvalidActionDescError={setShowInvalidActionDescError}
          showInvalidActionDescError={showInvalidActionDescError}
        />
      )}
    </div>
  );
}

interface AdvancedSettingsProps {
  maxStepsPerRun: number | null;
  setMaxStepsPerRun: (maxStepsPerRun: number | null) => void;
  hasFeature: (feature: WhitelistableFeature | null | undefined) => boolean;
}

function AdvancedSettings({
  maxStepsPerRun,
  setMaxStepsPerRun,
  hasFeature,
}: AdvancedSettingsProps) {
  const maxLimit = hasFeature("extended_max_steps_per_run")
    ? EXTENDED_MAX_STEPS_USE_PER_RUN_LIMIT
    : MAX_STEPS_USE_PER_RUN_LIMIT;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label="Advanced settings"
          variant="outline"
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60 p-2" align="end">
        <DropdownMenuLabel label={`Max steps per run (up to ${maxLimit})`} />
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
            if (!isNaN(value) && value >= 0 && value <= maxLimit) {
              setMaxStepsPerRun(value);
            }
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AddKnowledgeDropdownProps {
  hasFeature: (feature: WhitelistableFeature | null | undefined) => boolean;
  mcpServerViewsWithKnowledge: (MCPServerViewType & { label: string })[];
  setAction: (action: AssistantBuilderSetActionType) => void;
}

function AddKnowledgeDropdown({
  hasFeature,
  setAction,
  mcpServerViewsWithKnowledge,
}: AddKnowledgeDropdownProps) {
  const hideAction = useCallback(
    (key: (typeof DATA_SOURCES_ACTION_CATEGORIES)[number]) => {
      const spec = ACTION_SPECIFICATIONS[key];
      if (!hasFeature(spec.flag)) {
        return true;
      }
      switch (key) {
        case "RETRIEVAL_SEARCH":
          return mcpServerViewsWithKnowledge.some((v) => {
            const r = getInternalMCPServerNameAndWorkspaceId(v.server.sId);
            return r.isOk() && r.value.name === "search";
          });
        case "RETRIEVAL_EXHAUSTIVE":
          return mcpServerViewsWithKnowledge.some((v) => {
            const r = getInternalMCPServerNameAndWorkspaceId(v.server.sId);
            return r.isOk() && r.value.name === "include_data";
          });
        case "TABLES_QUERY":
          return mcpServerViewsWithKnowledge.some((v) => {
            const r = getInternalMCPServerNameAndWorkspaceId(v.server.sId);
            return r.isOk() && r.value.name === "query_tables";
          });
        case "PROCESS":
          return false;
        default:
          assertNever(key);
      }
    },
    [hasFeature, mcpServerViewsWithKnowledge]
  );

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button label="Add knowledge" size="sm" icon={BookOpenIcon} isSelect />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[20rem] md:w-[22rem]"
        collisionPadding={10}
      >
        {DATA_SOURCES_ACTION_CATEGORIES.map((key) => {
          // TODO(mcp): remove this when we are ready to clean up tables query entirely.
          if (key === "TABLES_QUERY") {
            return null;
          }

          const spec = ACTION_SPECIFICATIONS[key];
          if (hideAction(key)) {
            return null;
          }
          const action = getDefaultActionConfiguration(key);
          if (!action) {
            return null;
          }

          return (
            <DropdownMenuItem
              truncateText
              key={key}
              onClick={() => {
                setAction({
                  type: action.noConfigurationRequired ? "insert" : "pending",
                  action,
                });
              }}
              icon={<Avatar icon={spec.dropDownIcon} size="sm" />}
              label={spec.label}
              description={spec.description}
            />
          );
        })}
        {mcpServerViewsWithKnowledge.map((view) => {
          const action = getDefaultMCPServerActionConfiguration(view);
          assert(action);

          return (
            <DropdownMenuItem
              truncateText
              key={view.id}
              onClick={() => {
                setAction({
                  type: "pending",
                  action: { id: uniqueId(), ...action },
                });
              }}
              icon={getAvatar(view.server)}
              label={view.label}
              description={view.server.description}
            />
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
