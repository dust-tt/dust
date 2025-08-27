import {
  ActionPieChartIcon,
  Button,
  Checkbox,
  CloudArrowLeftRightIcon,
  CodeBlock,
  CollapsibleComponent,
  Icon,
  Label,
  MultiPageDialog,
  MultiPageDialogContent,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import { useValidateAction } from "@app/hooks/useValidateAction";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { getIcon } from "@app/lib/actions/mcp_icons";
import { useBlockedActions } from "@app/lib/swr/blocked_actions";
import { useCreatePersonalConnection } from "@app/lib/swr/mcp_servers";
import type {
  ConversationWithoutContentType,
  LightAgentMessageType,
  LightWorkspaceType,
  OAuthProvider,
  OAuthUseCase,
} from "@app/types";
import { asDisplayName } from "@app/types";

interface AuthenticationPageProps {
  authActions: BlockedToolExecution[];
  connectionStates: Record<string, "connecting" | "connected" | "idle">;
  setConnectionStates: React.Dispatch<
    React.SetStateAction<Record<string, "connecting" | "connected" | "idle">>
  >;
  createPersonalConnection: (params: {
    mcpServerId: string;
    mcpServerDisplayName: string;
    provider: OAuthProvider;
    useCase: OAuthUseCase;
    scope?: string;
  }) => Promise<boolean>;
  errorMessage: string | null;
  onAllConnected: () => void;
}

function AuthenticationPage({
  authActions,
  connectionStates,
  setConnectionStates,
  createPersonalConnection,
  errorMessage,
  onAllConnected,
}: AuthenticationPageProps) {
  return (
    <div className="flex flex-col gap-4">
      {authActions.map((blockedAction, authIndex) => (
        <div key={authIndex} className="rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex h-8 w-8 items-center justify-center">
                {blockedAction.metadata.icon ? (
                  <Icon visual={getIcon(blockedAction.metadata.icon)} />
                ) : null}
              </div>
              <div className="font-medium">
                {asDisplayName(blockedAction.metadata.mcpServerName)}
              </div>
            </div>
            {blockedAction.authorizationInfo && (
              <Button
                label={
                  connectionStates[blockedAction.actionId] === "connected"
                    ? "Connected"
                    : "Connect"
                }
                variant="outline"
                size="xs"
                icon={CloudArrowLeftRightIcon}
                disabled={
                  connectionStates[blockedAction.actionId] === "connecting" ||
                  connectionStates[blockedAction.actionId] === "connected"
                }
                isLoading={
                  connectionStates[blockedAction.actionId] === "connecting"
                }
                onClick={async () => {
                  setConnectionStates((prev) => ({
                    ...prev,
                    [blockedAction.actionId]: "connecting",
                  }));
                  const success = await createPersonalConnection({
                    mcpServerId: blockedAction.metadata.mcpServerId || "",
                    mcpServerDisplayName:
                      blockedAction.metadata.mcpServerDisplayName || "",
                    provider: blockedAction.authorizationInfo!.provider,
                    useCase: "connection",
                    scope: blockedAction.authorizationInfo!.scope,
                  });
                  if (success) {
                    setConnectionStates((prev) => ({
                      ...prev,
                      [blockedAction.actionId]: "connected",
                    }));
                    // Check if all authentications are connected and move to next page
                    const allConnected = authActions.every(
                      (action) =>
                        connectionStates[action.actionId] === "connected" ||
                        connectionStates[action.actionId] === "connecting"
                    );

                    if (allConnected) {
                      onAllConnected();
                    }
                  } else {
                    setConnectionStates((prev) => ({
                      ...prev,
                      [blockedAction.actionId]: "idle",
                    }));
                  }
                }}
              />
            )}
          </div>
        </div>
      ))}
      {errorMessage && (
        <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

interface ToolValidationPageProps {
  blockedAction: BlockedToolExecution;
  errorMessage: string | null;
  neverAskAgain: boolean;
  setNeverAskAgain: (value: boolean) => void;
}

function ToolValidationPage({
  blockedAction,
  errorMessage,
  neverAskAgain,
  setNeverAskAgain,
}: ToolValidationPageProps) {
  const hasDetails =
    blockedAction?.inputs && Object.keys(blockedAction.inputs).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        Allow{" "}
        <span className="font-semibold">
          @{blockedAction.metadata.agentName}
        </span>{" "}
        to use the tool{" "}
        <span className="font-semibold">
          {asDisplayName(blockedAction.metadata.toolName)}
        </span>{" "}
        from{" "}
        <span className="font-semibold">
          {asDisplayName(blockedAction.metadata.mcpServerName)}
        </span>
        ?
      </div>
      {hasDetails && (
        <CollapsibleComponent
          triggerChildren={
            <span className="font-medium text-muted-foreground dark:text-muted-foreground-night">
              Details
            </span>
          }
          contentChildren={
            <div>
              <div className="max-h-80 overflow-auto rounded-lg bg-muted dark:bg-muted-night">
                <CodeBlock
                  wrapLongLines
                  className="language-json overflow-y-auto"
                >
                  {JSON.stringify(blockedAction.inputs, null, 2)}
                </CodeBlock>
              </div>
            </div>
          }
        />
      )}
      {errorMessage && (
        <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
          {errorMessage}
        </div>
      )}
      {blockedAction.stake === "low" && (
        <div className="mt-5">
          <Label className="copy-sm flex w-fit cursor-pointer flex-row items-center gap-2 py-2 pr-2 font-normal">
            <Checkbox
              checked={neverAskAgain}
              onCheckedChange={(check) => {
                setNeverAskAgain(!!check);
              }}
            />
            <span>Always allow this tool</span>
          </Label>
        </div>
      )}
    </div>
  );
}

type BlockedActionQueueItem = {
  message?: LightAgentMessageType;
  blockedAction: BlockedToolExecution;
};

function useBlockedActionsQueue({
  blockedActions,
}: {
  blockedActions: BlockedToolExecution[];
}) {
  const [blockedActionsQueue, setBlockedActionsQueue] = useState<
    BlockedActionQueueItem[]
  >(blockedActions.map((action) => ({ blockedAction: action })));

  useEffect(() => {
    if (blockedActions.length > 0) {
      setBlockedActionsQueue((prevQueue) => {
        const existingIds = new Set(
          prevQueue.map((v) => v.blockedAction.actionId)
        );
        const newItems = blockedActions
          .filter((v) => !existingIds.has(v.actionId))
          .map((blockedAction) => ({
            blockedAction,
          }));
        return [...blockedActionsQueue, ...newItems];
      });
    }
  }, [blockedActions]);

  const enqueueBlockedAction = useCallback(
    ({
      message,
      blockedAction,
    }: {
      message: LightAgentMessageType;
      blockedAction: BlockedToolExecution;
    }) => {
      setBlockedActionsQueue((prevQueue) => {
        const existingIndex = prevQueue.findIndex(
          (v) => v.blockedAction.actionId === blockedAction.actionId
        );

        // If the action is not in the queue, add it.
        // If the action is in the queue, replace it with the new one.
        return existingIndex === -1
          ? [...blockedActionsQueue, { blockedAction, message }]
          : prevQueue.map((item, index) =>
              index === existingIndex ? { blockedAction, message } : item
            );
      });
    },
    []
  );

  const shiftBlockedActionQueue = useCallback(() => {
    setBlockedActionsQueue((prevQueue) => prevQueue.slice(1));
  }, []);

  return {
    blockedActionsQueue,
    enqueueBlockedAction,
    shiftBlockedActionQueue,
  };
}

type ActionValidationContextType = {
  enqueueBlockedAction: (params: {
    message: LightAgentMessageType;
    blockedAction: BlockedToolExecution;
  }) => void;
  showBlockedActionsDialog: () => void;
  hasBlockedActions: boolean;
  totalBlockedActions: number;
};

const ActionValidationContext = createContext<
  ActionValidationContextType | undefined
>(undefined);

export function useActionValidationContext() {
  const context = useContext(ActionValidationContext);
  if (!context) {
    throw new Error(
      "useActionValidationContext must be used within an ActionValidationContext"
    );
  }

  return context;
}

interface ActionValidationProviderProps {
  owner: LightWorkspaceType;
  conversation: ConversationWithoutContentType | null;
  children: ReactNode;
}

export function ActionValidationProvider({
  owner,
  conversation,
  children,
}: ActionValidationProviderProps) {
  const { createPersonalConnection } = useCreatePersonalConnection(owner);

  const { blockedActions } = useBlockedActions({
    conversationId: conversation?.sId || null,
    workspaceId: owner.sId,
  });

  const { blockedActionsQueue, enqueueBlockedAction } = useBlockedActionsQueue({
    blockedActions,
  });

  // Track connection states for each authentication item
  const [connectionStates, setConnectionStates] = useState<
    Record<string, "connecting" | "connected" | "idle">
  >({});

  const pendingValidations = useMemo(() => {
    return blockedActionsQueue.filter(
      (action) => action.blockedAction.status === "blocked_validation_required"
    );
  }, [blockedActionsQueue]);

  const pendingAuthentications = useMemo(() => {
    return blockedActionsQueue.filter(
      (action) =>
        action.blockedAction.status === "blocked_authentication_required" ||
        action.blockedAction.status === "blocked_child_action_input_required"
    );
  }, [blockedActionsQueue]);

  // Count of already validated actions.
  // used to keep track of the current page in the dialog and the total number of pages.
  const [validatedActions, setValidatedActions] = useState(0);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [neverAskAgain, setNeverAskAgain] = useState(false);

  // Track the status of the current submit action.
  const [submitStatus, setSubmitStatus] =
    useState<MCPValidationOutputType | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { validateAction, isValidating } = useValidateAction({
    owner,
    conversation,
    onError: setErrorMessage,
  });

  useNavigationLock(isDialogOpen);

  // Open the dialog when there are pending validations and the dialog is not open.
  useEffect(() => {
    if (blockedActionsQueue.length > 0 && !isDialogOpen) {
      setValidatedActions(0);
      setIsDialogOpen(true);
    } else if (
      blockedActionsQueue.length === 0 &&
      isDialogOpen &&
      !isValidating
    ) {
      setIsDialogOpen(false);
    }
  }, [blockedActionsQueue.length, isDialogOpen, isValidating]);

  const submitValidation = async (status: MCPValidationOutputType) => {
    setSubmitStatus(status);
    if (!blockedActionsQueue.length) {
      return;
    }

    const currentBlockedAction = blockedActionsQueue[0];

    const { blockedAction, message } = currentBlockedAction;
    const result = await validateAction({
      validationRequest: blockedAction,
      message,
      approved:
        status === "approved" && neverAskAgain ? "always_approved" : status,
    });

    if (!result.success) {
      return;
    }

    setSubmitStatus(null);
    setNeverAskAgain(false);
    setErrorMessage(null);

    setValidatedActions((c) => c + 1);
  };

  const showBlockedActionsDialog = useCallback(() => {
    if (!isDialogOpen && blockedActionsQueue.length > 0) {
      setValidatedActions(0);
      setIsDialogOpen(true);
    }
  }, [isDialogOpen, blockedActionsQueue.length]);

  const hasPendingValidations = pendingValidations.length > 0;
  const hasPendingAuthentications = pendingAuthentications.length > 0;
  const hasBlockedActions = hasPendingValidations || hasPendingAuthentications;
  const totalBlockedActions =
    pendingValidations.length + pendingAuthentications.length;

  const pages = useMemo(() => {
    const totalCount =
      validatedActions +
      (hasPendingAuthentications ? 1 : 0) +
      pendingValidations.length;

    if (totalCount === 0) {
      return [];
    }

    return Array.from({ length: totalCount }, (_, index) => {
      if (hasPendingAuthentications && index === 0) {
        // Create a combined authentication page with all pending authentications
        const authActions = pendingAuthentications.map(
          (item) => item.blockedAction
        );

        return {
          id: index.toString(),
          title: "Personal authentication required",
          description:
            "The agent requires authentication for the following tools",
          icon: undefined,
          content: (
            <AuthenticationPage
              authActions={authActions}
              connectionStates={connectionStates}
              setConnectionStates={setConnectionStates}
              createPersonalConnection={createPersonalConnection}
              errorMessage={errorMessage}
              onAllConnected={() => setValidatedActions((prev) => prev + 1)}
            />
          ),
        };
      }

      // For validation pages, adjust the index to account for the authentication page
      const validationIndex = hasPendingAuthentications ? index - 1 : index;
      const { blockedAction } = pendingValidations[validationIndex];

      return {
        id: index.toString(),
        title: "Tool Validation Required",
        icon: blockedAction.metadata.icon
          ? getIcon(blockedAction.metadata.icon)
          : ActionPieChartIcon,
        content: (
          <ToolValidationPage
            blockedAction={blockedAction}
            errorMessage={errorMessage}
            neverAskAgain={neverAskAgain}
            setNeverAskAgain={setNeverAskAgain}
          />
        ),
      };
    });
  }, [
    errorMessage,
    neverAskAgain,
    validatedActions,
    connectionStates,
    createPersonalConnection,
    hasPendingAuthentications,
    pendingValidations,
    pendingAuthentications,
  ]);

  return (
    <ActionValidationContext.Provider
      value={{
        showBlockedActionsDialog,
        enqueueBlockedAction,
        hasBlockedActions,
        totalBlockedActions,
      }}
    >
      {children}

      <MultiPageDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        {pages.length > 0 && (
          <MultiPageDialogContent
            pages={pages}
            currentPageId={validatedActions.toString()}
            onPageChange={() => {}}
            hideCloseButton
            size="lg"
            isAlertDialog
            showNavigation={true}
            showHeaderNavigation={false}
            footerContent={(() => {
              // Check if we're on the authentication page (first page with pending authentications)
              const isOnAuthenticationPage =
                hasPendingAuthentications && validatedActions === 0;

              if (isOnAuthenticationPage) {
                return (
                  <div className="flex flex-row justify-end gap-2">
                    <Button
                      variant="outline"
                      label="Decline"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Skip
                    </Button>
                  </div>
                );
              }

              // For validation pages, show the usual Allow/Decline buttons
              return (
                <div className="flex flex-row justify-end gap-2">
                  <Button
                    variant="outline"
                    label="Decline"
                    onClick={() => submitValidation("rejected")}
                    disabled={isValidating}
                    isLoading={submitStatus === "rejected"}
                  >
                    Decline
                  </Button>
                  <Button
                    variant="highlight"
                    label="Allow"
                    autoFocus
                    onClick={() => submitValidation("approved")}
                    disabled={isValidating}
                    isLoading={submitStatus === "approved"}
                  >
                    Allow
                  </Button>
                </div>
              );
            })()}
          />
        )}
      </MultiPageDialog>
    </ActionValidationContext.Provider>
  );
}
