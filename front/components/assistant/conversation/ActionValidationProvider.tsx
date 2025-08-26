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
    currentItem,
    clearCurrentValidation,
    enqueueValidation,
    shiftValidationQueue,
  } = useValidationQueue({ pendingValidations });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [neverAskAgain, setNeverAskAgain] = useState(false);

  useNavigationLock(isDialogOpen);

  const submitValidation = async (status: MCPValidationOutputType) => {
    if (!currentItem) {
      return;
    }

    let approved = status;
    if (status === "approved" && neverAskAgain) {
      approved = "always_approved";
    }

    setErrorMessage(null);
    setIsProcessing(true);

    const { validationRequest, message } = currentItem;

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

  const hasPendingValidations =
    currentItem !== null || validationQueueLength > 0;
  const totalPendingValidations = (currentItem ? 1 : 0) + validationQueueLength;
  const validationRequest = currentItem?.validationRequest;

  return (
    <ActionValidationContext.Provider
      value={{
        showValidationDialog,
        enqueueValidation,
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
                validationRequest?.metadata.icon ? (
                  getAvatarFromIcon(validationRequest?.metadata.icon)
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
