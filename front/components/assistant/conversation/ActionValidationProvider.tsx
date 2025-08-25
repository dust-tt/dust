import {
  ActionPieChartIcon,
  Button,
  Checkbox,
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
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { getAvatarFromIcon } from "@app/lib/actions/mcp_icons";
import { useBlockedActions } from "@app/lib/swr/blocked_actions";
import type {
  ConversationWithoutContentType,
  LightAgentMessageType,
  LightWorkspaceType,
  MCPActionValidationRequest,
} from "@app/types";
import { asDisplayName, pluralize } from "@app/types";

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

  const [currentValidation, setCurrentValidation] = useState<{
    message?: LightAgentMessageType;
    validationRequest: MCPActionValidationRequest;
  } | null>(null);

  useEffect(() => {
    const nextValidation = pendingValidations[0];
    if (nextValidation) {
      setCurrentValidation({ validationRequest: nextValidation });
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

  const handleValidationRequest = useCallback(
    (validationRequest: MCPActionValidationRequest) => {
      setCurrentValidation((current) => {
        if (
          current === null ||
          current.validationRequest.actionId === validationRequest.actionId
        ) {
          return { validationRequest };
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
  const takeNextFromQueue = useCallback(() => {
    const enqueuedActionIds = Object.keys(validationQueue);

    if (enqueuedActionIds.length > 0) {
      const nextValidationActionId = enqueuedActionIds[0];
      const nextValidation = validationQueue[nextValidationActionId];

      setValidationQueue((prevRecord) => {
        const newRecord = { ...prevRecord };
        delete newRecord[nextValidationActionId];
        return newRecord;
      });
      return nextValidation;
    }

    return null;
  }, [validationQueue]);

  const validationQueueLength = useMemo(
    () => Object.keys(validationQueue).length,
    [validationQueue]
  );

  return {
    validationQueueLength,
    currentValidation,
    handleValidationRequest,
    takeNextFromQueue,
    setCurrentValidation,
  };
}

type ActionValidationContextType = {
  showValidationDialog: (params?: {
    message: LightAgentMessageType;
    validationRequest: MCPActionValidationRequest;
  }) => void;
  hasPendingValidations: boolean;
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

  // Filter blocked actions to only get validation required ones.
  // TODO(durable-agents): also display blocked_authentication_required.
  const pendingValidations = useMemo(() => {
    return blockedActions.filter(
      (action) => action.status === "blocked_validation_required"
    );
  }, [blockedActions]);

  const {
    validationQueueLength,
    currentValidation,
    setCurrentValidation,
    handleValidationRequest,
    takeNextFromQueue,
  } = useValidationQueue({ pendingValidations });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [neverAskAgain, setNeverAskAgain] = useState(false);

  useNavigationLock(isDialogOpen);

  const sendCurrentValidation = async (status: MCPValidationOutputType) => {
    if (!currentValidation) {
      return;
    }

    let approved = status;
    if (status === "approved" && neverAskAgain) {
      approved = "always_approved";
    }

    setErrorMessage(null);
    setIsProcessing(true);

    const { validationRequest, message } = currentValidation;

    const response = await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${validationRequest.conversationId}/messages/${validationRequest.messageId}/validate-action`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actionId: validationRequest.actionId,
          approved,
        }),
      }
    );

    // Retry on blocked tools on the main conversation if there is one that is != from the event's.
    if (
      conversation?.sId &&
      message &&
      conversation.sId !== validationRequest.conversationId
    ) {
      await fetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}/messages/${message.sId}/retry?blocked_only=true`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    setIsProcessing(false);

    if (!response.ok) {
      setErrorMessage("Failed to assess action approval. Please try again.");
      return;
    }

    setNeverAskAgain(false);
  };

  const handleSubmit = (approved: MCPValidationOutputType) => {
    void sendCurrentValidation(approved);

    const foundItem = takeNextFromQueue();
    if (foundItem) {
      setCurrentValidation({ validationRequest: foundItem });
    } else {
      // To avoid content flickering, we will clear out the current validation in onDialogAnimationEnd.
      setIsDialogOpen(false);
    }
  };

  // To avoid content flickering, we will clear out the current validation when closing animation ends.
  const onDialogAnimationEnd = () => {
    // This is safe to check because the dialog closing animation is triggered after isDialogOpen is set to false.
    if (!isDialogOpen) {
      setCurrentValidation(null);
      setErrorMessage(null);
    }
  };

  // This will be used as a dependency of the hook down the line so we need to use useCallback.
  const showValidationDialog = useCallback(
    (params?: {
      message: LightAgentMessageType;
      validationRequest: MCPActionValidationRequest;
    }) => {
      if (!isDialogOpen) {
        setIsDialogOpen(true);
      }

      // If we have a new validation request, queue it.
      if (params?.validationRequest) {
        handleValidationRequest(params?.validationRequest);
      }
    },
    [handleValidationRequest, isDialogOpen]
  );

  const hasPendingValidations =
    currentValidation !== null || validationQueueLength > 0;
  const totalPendingValidations =
    (currentValidation ? 1 : 0) + validationQueueLength;

  return (
    <ActionValidationContext.Provider
      value={{
        showValidationDialog,
        hasPendingValidations,
        totalPendingValidations,
      }}
    >
      {children}

      <Dialog open={isDialogOpen}>
        <DialogContent isAlertDialog onAnimationEnd={onDialogAnimationEnd}>
          <DialogHeader hideButton>
            <DialogTitle
              visual={
                currentValidation?.validationRequest.metadata.icon ? (
                  getAvatarFromIcon(
                    currentValidation.validationRequest.metadata.icon
                  )
                ) : (
                  <Icon visual={ActionPieChartIcon} size="sm" />
                )
              }
            >
              Tool Validation Required
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              <div>
                Allow{" "}
                <b>
                  @{currentValidation?.validationRequest.metadata.agentName}
                </b>{" "}
                to use the tool{" "}
                <b>
                  {asDisplayName(
                    currentValidation?.validationRequest.metadata.toolName
                  )}
                </b>{" "}
                from{" "}
                <b>
                  {asDisplayName(
                    currentValidation?.validationRequest.metadata.mcpServerName
                  )}
                </b>
                ?
              </div>
              {currentValidation?.validationRequest.inputs &&
                Object.keys(currentValidation.validationRequest.inputs).length >
                  0 && (
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
                              currentValidation?.validationRequest.inputs,
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
            {currentValidation?.validationRequest.stake === "low" && (
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
          </DialogContainer>
          <DialogFooter>
            <Button
              label="Decline"
              variant="outline"
              onClick={() => handleSubmit("rejected")}
              disabled={isProcessing}
            >
              {isProcessing && (
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
              disabled={isProcessing}
            >
              {isProcessing && (
                <div className="flex items-center">
                  <span className="mr-2">Approving</span>
                  <Spinner size="xs" variant="light" />
                </div>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ActionValidationContext.Provider>
  );
}
