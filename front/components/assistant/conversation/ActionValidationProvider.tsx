import {
  ActionPieChartIcon,
  Button,
  Checkbox,
  Chip,
  CloudArrowLeftRightIcon,
  CodeBlock,
  CollapsibleComponent,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Label,
  Spinner,
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
import type { BlockedActionExecution } from "@app/lib/actions/mcp";
import { getMcpServerDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatarFromIcon } from "@app/lib/actions/mcp_icons";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useBlockedActions } from "@app/lib/swr/blocked_actions";
import {
  useCreatePersonalConnection,
  useMCPServer,
} from "@app/lib/swr/mcp_servers";
import type {
  ConversationWithoutContentType,
  LightAgentMessageType,
  LightWorkspaceType,
  MCPActionValidationRequest,
} from "@app/types";
import { asDisplayName, pluralize } from "@app/types";

interface PersonalAuthenticationRequiredInlineProps {
  owner: LightWorkspaceType;
  blockedAction: BlockedActionExecution & {
    mcpServerId: string;
    authorizationInfo: AuthorizationInfo;
  };
  retryHandler: () => void;
}

function PersonalAuthenticationRequiredInline({
  owner,
  blockedAction,
  retryHandler,
}: PersonalAuthenticationRequiredInlineProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // TODO: get rid of this
  const { server: mcpServer } = useMCPServer({
    owner,
    serverId: blockedAction.mcpServerId,
  });

  const { createPersonalConnection } = useCreatePersonalConnection(owner);
  const { submit: retry } = useSubmitFunction(async () => retryHandler());

  const handleConnect = async () => {
    if (!mcpServer) {
      return;
    }
    setIsConnecting(true);
    const success = await createPersonalConnection(
      mcpServer,
      blockedAction.authorizationInfo.provider,
      "personal_actions",
      blockedAction.authorizationInfo.scope
    );
    setIsConnecting(false);
    if (!success) {
      setIsConnected(false);
    } else {
      setIsConnected(true);
      await retry();
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        {blockedAction.metadata.icon ? (
          getAvatarFromIcon(blockedAction.metadata.icon, "md")
        ) : (
          <Icon visual={ActionPieChartIcon} size="sm" />
        )}
        <span className="font-medium">
          {asDisplayName(blockedAction.metadata.mcpServerName)}
        </span>
      </div>
      {mcpServer &&
        (isConnected ? (
          <Chip color="success" size="xs">
            Connected
          </Chip>
        ) : isConnecting ? (
          <Spinner size="sm" />
        ) : (
          <Button
            label={"Connect"}
            variant={"outline"}
            size="sm"
            icon={CloudArrowLeftRightIcon}
            disabled={isConnecting || isConnected}
            onClick={() => handleConnect()}
          />
        ))}
    </div>
  );
}

function useValidationQueue({
  pendingValidations,
}: {
  pendingValidations: MCPActionValidationRequest[];
}) {
  // We store two states: the current validation and a queue.
  // The current validation is the one displayed in the dialog that can be validated.
  // The queue does not store the current validation.
  const [validationQueue, setValidationQueue] = useState<
    // Store validations by `actionId` to prevent duplicate entries.
    Record<string, MCPActionValidationRequest>
  >({});

  const [currentItem, setCurrentItem] = useState<{
    message?: LightAgentMessageType;
    validationRequest: MCPActionValidationRequest;
  } | null>(null);

  useEffect(() => {
    const nextValidation = pendingValidations[0];
    if (nextValidation) {
      setCurrentItem({ validationRequest: nextValidation });
    }
    if (pendingValidations.length > 1) {
      setValidationQueue(
        Object.fromEntries(
          pendingValidations
            .slice(1)
            .map((validation) => [validation.actionId, validation])
        )
      );
    }
  }, [pendingValidations]);

  const enqueueValidation = useCallback(
    ({
      message,
      validationRequest,
    }: {
      message: LightAgentMessageType;
      validationRequest: MCPActionValidationRequest;
    }) => {
      setCurrentItem((current) => {
        if (
          current === null ||
          current.validationRequest.actionId === validationRequest.actionId
        ) {
          return { message, validationRequest };
        }

        setValidationQueue((prevRecord) => ({
          ...prevRecord,
          [validationRequest.actionId]: validationRequest,
        }));
        return current;
      });
    },
    []
  );

  // We don't update the current validation here to avoid content flickering.
  const shiftValidationQueue = useCallback(() => {
    const enqueuedActionIds = Object.keys(validationQueue);

    if (enqueuedActionIds.length > 0) {
      const nextValidationActionId = enqueuedActionIds[0];
      const nextValidation = validationQueue[nextValidationActionId];

      setValidationQueue((prevRecord) => {
        const newRecord = { ...prevRecord };
        delete newRecord[nextValidationActionId];
        return newRecord;
      });
      setCurrentItem({ validationRequest: nextValidation });
      return nextValidation;
    }

    return null;
  }, [validationQueue]);

  const validationQueueLength = useMemo(
    () => Object.keys(validationQueue).length,
    [validationQueue]
  );

  const clearCurrentValidation = () => {
    setCurrentItem(null);
  };

  return {
    validationQueueLength,
    currentItem,
    enqueueValidation,
    shiftValidationQueue,
    clearCurrentValidation,
  };
}

type ActionValidationContextType = {
  enqueueValidation: (params: {
    message: LightAgentMessageType;
    validationRequest: MCPActionValidationRequest;
  }) => void;
  showValidationDialog: () => void;
  userActionIsRequired: boolean;
  totalPendingValidations: number;
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
  const { blockedActions } = useBlockedActions({
    conversationId: conversation?.sId || null,
    workspaceId: owner.sId,
  });

  const { createPersonalConnection } = useCreatePersonalConnection(owner);

  const [actionsBlockedOnAuthentication, setActionsBlockedOnAuthentication] =
    useState<BlockedActionExecution[]>([]);

  // Filter blocked actions to only get validation required ones.
  // TODO(durable-agents): also display blocked_authentication_required.
  const pendingValidations = useMemo(() => {
    return blockedActions.filter(
      (action) => action.status === "blocked_validation_required"
    );
  }, [blockedActions]);

  useEffect(() => {
    setActionsBlockedOnAuthentication(
      blockedActions.filter(
        (action) => action.status === "blocked_authentication_required"
      )
    );
  }, [blockedActions]);

  const {
    validationQueueLength,
    currentItem,
    clearCurrentValidation,
    enqueueValidation,
    shiftValidationQueue,
  } = useValidationQueue({ pendingValidations });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [neverAskAgain, setNeverAskAgain] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { validateAction, isValidating } = useValidateAction({
    owner,
    conversation,
    onError: setErrorMessage,
  });

  useNavigationLock(isDialogOpen);

  const retryBlockedActions = async () => {
    setErrorMessage(null);
    setIsProcessing(true);

    const [authenticationRequiredAction] = actionsBlockedOnAuthentication;

    const response = await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${authenticationRequiredAction.conversationId}/messages/${authenticationRequiredAction.messageId}/retry?blocked_only=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    setIsProcessing(false);

    if (!response.ok) {
      setErrorMessage("Failed to resume conversation. Please try again.");
      return;
    }
  };

  const submitValidation = async (status: MCPValidationOutputType) => {
    if (!currentItem) {
      return;
    }

    const { validationRequest, message } = currentItem;

    const result = await validateAction({
      validationRequest,
      message,
      approved:
        status === "approved" && neverAskAgain ? "always_approved" : status,
    });

    if (result.success) {
      setNeverAskAgain(false);
      setErrorMessage(null);
    }
  };

  const handleSubmit = (approved: MCPValidationOutputType) => {
    void submitValidation(approved);

    const nextValidationRequest = shiftValidationQueue();
    // We will clear out the current validation in onDialogAnimationEnd to avoid content flickering.
    if (!nextValidationRequest) {
      setIsDialogOpen(false);
    }
  };

  // To avoid content flickering, we will clear out the current validation when closing animation ends.
  const onDialogAnimationEnd = () => {
    // This is safe to check because the dialog closing animation is triggered after isDialogOpen is set to false.
    if (!isDialogOpen) {
      clearCurrentValidation();
      setErrorMessage(null);
    }
  };

  // We need the useCallback because this will be used as a dependency of the hook down the line.
  const showValidationDialog = useCallback(() => {
    if (!isDialogOpen) {
      setIsDialogOpen(true);
    }
  }, [isDialogOpen]);

  const isAuthenticationRequired = actionsBlockedOnAuthentication.length > 0;
  const userActionIsRequired =
    currentValidation !== null ||
    validationQueueLength > 0 ||
    isAuthenticationRequired;
  const totalPendingValidations = isAuthenticationRequired
    ? 1
    : (currentValidation ? 1 : 0) + validationQueueLength;
  const validationRequest = currentItem?.validationRequest;

  return (
    <ActionValidationContext.Provider
      value={{
        showValidationDialog,
        enqueueValidation,
        userActionIsRequired,
        totalPendingValidations,
      }}
    >
      {children}

      <Dialog open={isDialogOpen}>
        <DialogContent isAlertDialog onAnimationEnd={onDialogAnimationEnd}>
          <DialogHeader hideButton>
            <DialogTitle
              visual={
                !isAuthenticationRequired &&
                (validationRequest?.metadata.icon ? (
                  getAvatarFromIcon(validationRequest.metadata.icon)
                ) : (
                  <Icon visual={ActionPieChartIcon} size="sm" />
                ))
              }
            >
              {isAuthenticationRequired ? (
                <div className="flex flex-col">
                  <span>Personal Authentication Required</span>
                  <span className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                    The agent took an action that requires personal
                    authentication
                  </span>
                </div>
              ) : (
                "Tool Validation Required"
              )}
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {/* TODO: move this to an actual component, TBD on work on triggers.. */}
            {isAuthenticationRequired ? (
                <div className="flex flex-col gap-4">
                <span>
                  The agent took an action that requires personal authentication
                </span>
                  {actionsBlockedOnAuthentication.map((action) => (
                    // TODO
                    <div key={action.actionId}>
                      <b>@{action.metadata.agentName}</b> is trying to use the
                      tool <b>{asDisplayName(action.metadata.toolName)}</b> from{" "}
                      <b>{asDisplayName(action.metadata.mcpServerName)}</b>
                    </div>
                  ))}
                </div>
              ) :(
                <>
            <div className="flex flex-col gap-4">
              <div>
                Allow{" "}
                <span className="font-semibold">
                  @{validationRequest?.metadata.agentName}
                </span>{" "}
                to use the tool{" "}
                <span className="font-semibold">
                  {asDisplayName(validationRequest?.metadata.toolName)}
                </span>{" "}
                from{" "}
                <span className="font-semibold">
                  {asDisplayName(validationRequest?.metadata.mcpServerName)}
                </span>
                ?
              </div>
              {validationRequest?.inputs &&
                Object.keys(validationRequest?.inputs).length > 0 && (
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
                            {JSON.stringify(validationRequest?.inputs, null, 2)}
                          </CodeBlock>
                        </div>
                      </div>
                    }
                  />
                )}

              {validationQueueLength > 0 && (
                <div className="mt-2 text-sm font-medium text-info-900 dark:text-info-900-night">
                  {validationQueueLength} more request
                  {pluralize(validationQueueLength)} in the queue
                </div>
              )}

              {errorMessage && (
                <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
                  {errorMessage}
                </div>
              )}
            </div>
            {validationRequest?.stake === "low" && (
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
            )}</>)
            {/* TODO: move this to an actual component, TBD on work on triggers.. */}
            {isAuthenticationRequired ? (
              <div className="mb-4 flex flex-col gap-4">
                {actionsBlockedOnAuthentication.map(
                  (action) =>
                    action.authorizationInfo &&
                    action.mcpServerId && (
                      <PersonalAuthenticationRequiredInline
                        key={`personal-auth-${action.actionId}`}
                        owner={owner}
                        blockedAction={{
                          ...action,
                          mcpServerId: action.mcpServerId,
                          authorizationInfo: action.authorizationInfo,
                        }}
                        retryHandler={retryBlockedActions}
                      />
                    )
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4">
                  <div>
                    Allow <b>@{currentValidation?.metadata.agentName}</b> to use
                    the tool{" "}
                    <b>{asDisplayName(currentValidation?.metadata.toolName)}</b>{" "}
                    from{" "}
                    <b>
                      {asDisplayName(currentValidation?.metadata.mcpServerName)}
                    </b>
                    ?
                  </div>
                  {currentValidation?.inputs &&
                    Object.keys(currentValidation.inputs).length > 0 && (
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
                                {JSON.stringify(
                                  currentValidation?.inputs,
                                  null,
                                  2
                                )}
                              </CodeBlock>
                            </div>
                          </div>
                        }
                      />
                    )}
                  {validationQueueLength > 0 && (
                    <div className="mt-2 text-sm font-medium text-info-900 dark:text-info-900-night">
                      {validationQueueLength} more request
                      {pluralize(validationQueueLength)} in the queue
                    </div>
                  )}
                  {errorMessage && (
                    <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
                      {errorMessage}
                    </div>
                  )}
                </div>
                {currentValidation?.stake === "low" && (
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
              </>
              {errorMessage && (
                <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
                  {errorMessage}
                </div>
              )}
            </div>
            {validationRequest?.stake === "low" && (
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
          </DialogContainer>
          <DialogFooter>
            {isAuthenticationRequired ? (
              <Button
                label="Done"
                variant="highlight"
                onClick={() => {
                  void retryBlockedActions();
                  setIsDialogOpen(false);
                }}
                disabled={isProcessing}
              >
                {isProcessing && (
                  <div className="flex items-center">
                    <span className="mr-2">Resuming</span>
                    <Spinner size="xs" variant="dark" />
                  </div>
                )}
              </Button>
            ) : (
              <>
                <Button
                  label="Decline"
                  variant="outline"
                  onClick={() => handleSubmit("rejected")}
                  disabled={isValidating}
                >
                  {isValidating && (
                    <div className="flex items-center">
                      <span className="mr-2">Declining</span>
                      <Spinner size="xs" variant="dark" />
                    </div>
                  )}
                </Button>
                <Button
                  label="Allow"
                  variant="highlight"
                  onClick={() => handleSubmit("approved")}
                  disabled={isValidating}
                >
                  {isValidating && (
                    <div className="flex items-center">
                      <span className="mr-2">Approving</span>
                      <Spinner size="xs" variant="light" />
                    </div>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ActionValidationContext.Provider>
  );
}
