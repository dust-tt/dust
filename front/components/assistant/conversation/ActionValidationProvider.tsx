import {
  Button,
  CodeBlock,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { createContext, useCallback, useEffect, useState } from "react";

import type {
  MCPToolStakeLevelType,
  MCPValidationOutputType,
} from "@app/lib/actions/constants";
import type { MCPActionType } from "@app/lib/actions/mcp";

type ActionValidationContextType = {
  showValidationDialog: (validationRequest: {
    workspaceId: string;
    messageId: string;
    conversationId: string;
    action: MCPActionType;
    inputs: Record<string, unknown>;
    stake?: MCPToolStakeLevelType;
  }) => void;
};

// Pending validation requests, keyed by message ID
export type PendingValidationRequestType = {
  workspaceId: string;
  messageId: string;
  conversationId: string;
  action: MCPActionType;
  inputs: Record<string, unknown>;
  stake?: MCPToolStakeLevelType;
};

export const ActionValidationContext =
  createContext<ActionValidationContextType>({} as ActionValidationContextType);

function useValidationQueue() {
  const [validationQueue, setValidationQueue] = useState<
    PendingValidationRequestType[]
  >([]);
  const [currentValidation, setCurrentValidation] =
    useState<PendingValidationRequestType | null>(null);

  // Queue stores the pending validation requests
  // The current validation request is the one being processed
  // The queue does not stores the current validation request
  const addToQueue = (validationRequest: PendingValidationRequestType) => {
    setCurrentValidation((current) => {
      if (current === null) {
        return validationRequest;
      }

      setValidationQueue((prevQueue) => [...prevQueue, validationRequest]);
      return current;
    });
  };

  const takeNextFromQueue = () => {
    if (validationQueue.length > 0) {
      const nextValidation = validationQueue[0];
      const newQueue = validationQueue.slice(1);
      setValidationQueue(newQueue);
      setCurrentValidation(nextValidation);
      return nextValidation;
    } else {
      setCurrentValidation(null);
      return null;
    }
  };

  return {
    validationQueue,
    currentValidation,
    addToQueue,
    takeNextFromQueue,
  };
}

export function ActionValidationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { validationQueue, currentValidation, addToQueue, takeNextFromQueue } =
    useValidationQueue();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sendCurrentValidation = useCallback(
    async (approved: MCPValidationOutputType) => {
      if (!currentValidation) {
        return;
      }

      setErrorMessage(null);
      setIsProcessing(true);

      const response = await fetch(
        `/api/w/${currentValidation.workspaceId}/assistant/conversations/${currentValidation.conversationId}/messages/${currentValidation.messageId}/validate-action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actionId: currentValidation.action.id,
            approved,
          }),
        }
      );

      if (!response.ok) {
        setErrorMessage(`Failed to assess action approval. Please try again.`);
        return;
      }
    },
    [currentValidation]
  );

  const handleSubmit = useCallback(
    (approved: MCPValidationOutputType) => {
      void sendCurrentValidation(approved);
      setIsProcessing(false);
      const foundItem = takeNextFromQueue();
      if (!foundItem) {
        setIsDialogOpen(false);
      }
    },
    [sendCurrentValidation, takeNextFromQueue]
  );

  useEffect(() => {
    if (currentValidation) {
      setIsDialogOpen(true);
    }
  }, [currentValidation]);

  const showValidationDialog = (validationRequest: {
    workspaceId: string;
    messageId: string;
    conversationId: string;
    action: MCPActionType;
    inputs: Record<string, unknown>;
    stake?: MCPToolStakeLevelType;
  }) => {
    addToQueue(validationRequest);
    setErrorMessage(null);
  };

  return (
    <ActionValidationContext.Provider value={{ showValidationDialog }}>
      {children}

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (open === false && !isProcessing) {
            if (currentValidation) {
              void handleSubmit("action_rejected");
            }
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Action Validation Required</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              <div>
                <span className="font-medium">Action:</span>{" "}
                {currentValidation?.action.functionCallName}
              </div>
              {currentValidation?.inputs &&
                Object.keys(currentValidation.inputs).length > 0 && (
                  <div>
                    <span className="font-medium">Inputs:</span>
                    <CodeBlock className="language-json">
                      {JSON.stringify(currentValidation?.inputs, null, 2)}
                    </CodeBlock>
                  </div>
                )}
              <div>Do you want to allow this action to proceed?</div>

              {validationQueue.length > 0 && (
                <div className="mt-2 text-sm font-medium text-info-900">
                  {validationQueue.length} more action
                  {validationQueue.length > 1 ? "s" : ""} in queue
                </div>
              )}

              {errorMessage && (
                <div className="mt-2 text-sm font-medium text-warning-800">
                  {errorMessage}
                </div>
              )}
            </div>
          </DialogContainer>
          <DialogFooter>
            <Button
              label="Decline"
              variant="outline"
              onClick={() => handleSubmit("action_rejected")}
              disabled={isProcessing}
            >
              {isProcessing && (
                <div className="flex items-center">
                  <span className="mr-2">Declining</span>
                  <Spinner size="xs" variant="dark" />
                </div>
              )}
            </Button>
            {currentValidation?.stake === "low" && (
              <Button
                label="Approve and never ask again"
                variant="ghost"
                onClick={() => {
                  handleSubmit("action_always_approved");
                }}
                disabled={isProcessing}
              >
                {isProcessing && (
                  <div className="flex items-center">
                    <span className="mr-2">Approving</span>
                    <Spinner size="xs" variant="dark" />
                  </div>
                )}
              </Button>
            )}
            <Button
              label="Approve"
              variant="primary"
              onClick={() => handleSubmit("action_approved")}
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
