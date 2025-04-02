import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { createContext, useEffect, useState } from "react";
import sanitizeHtml from "sanitize-html";

import type { MCPActionType } from "@app/lib/actions/mcp";

type ActionValidationContextType = {
  showValidationDialog: (props: {
    workspaceId: string;
    messageId: string;
    conversationId: string;
    action: MCPActionType;
    inputs: Record<string, unknown>;
    hash: string;
  }) => void;
};

// Pending validation requests, keyed by message ID
export type PendingValidationRequestType = {
  workspaceId: string;
  messageId: string;
  conversationId: string;
  action: MCPActionType;
  inputs: Record<string, unknown>;
  hash: string;
};

export const ActionValidationContext =
  createContext<ActionValidationContextType>({} as ActionValidationContextType);

function useValidationQueue() {
  const [validationQueue, setValidationQueue] = useState<
    PendingValidationRequestType[]
  >([]);
  const [currentValidation, setCurrentValidation] =
    useState<PendingValidationRequestType | null>(null);

  const addToQueue = (props: PendingValidationRequestType) => {
    setValidationQueue((prevQueue) => [...prevQueue, props]);
  };

  const removeFromQueue = () => {
    if (validationQueue.length > 0) {
      const nextValidation = validationQueue[0];
      const newQueue = validationQueue.slice(1);
      setValidationQueue(newQueue);
      setCurrentValidation(nextValidation);
    }
  };

  const clearCurrentValidation = () => {
    setCurrentValidation(null);
  };

  return {
    validationQueue,
    currentValidation,
    addToQueue,
    removeFromQueue,
    clearCurrentValidation,
  };
}

export function ActionValidationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    validationQueue,
    currentValidation,
    addToQueue,
    removeFromQueue,
    clearCurrentValidation,
  } = useValidationQueue();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (currentValidation) {
      setIsDialogOpen(true);
    }
  }, [currentValidation]);

  useEffect(() => {
    if (!isDialogOpen && currentValidation && !isProcessing) {
      void handleSubmit(false);
    }
  }, [isDialogOpen]);

  useEffect(() => {
    if (
      !isProcessing &&
      validationQueue.length > 0 &&
      !currentValidation &&
      !isDialogOpen
    ) {
      removeFromQueue();
      setErrorMessage(null);
    }
  }, [
    isProcessing,
    validationQueue,
    currentValidation,
    isDialogOpen,
    removeFromQueue,
  ]);

  const sendCurrentValidation = async (approved: boolean) => {
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
          paramsHash: currentValidation.hash,
        }),
      }
    );

    if (!response.ok) {
      setErrorMessage(
        `Failed to ${approved ? "approve" : "reject"} action. Please try again.`
      );
      return;
    }
  };

  const handleSubmit = async (approved: boolean) => {
    void sendCurrentValidation(approved);
    setIsProcessing(false);
    setIsDialogOpen(false);
    clearCurrentValidation();
  };

  const showValidationDialog = (props: {
    workspaceId: string;
    messageId: string;
    conversationId: string;
    action: MCPActionType;
    inputs: Record<string, unknown>;
    hash: string;
  }) => {
    addToQueue(props);
    setErrorMessage(null);
  };

  return (
    <ActionValidationContext.Provider value={{ showValidationDialog }}>
      {children}

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (open === false && !isProcessing) {
            setIsDialogOpen(false);
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
              <div>
                <span className="font-medium">Inputs:</span>
                <pre className="mt-2 whitespace-pre-wrap rounded bg-primary-50 p-2 text-sm dark:bg-primary-50-night">
                  {sanitizeHtml(
                    JSON.stringify(currentValidation?.inputs, null, 2)
                  )}
                </pre>
              </div>
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
          <DialogFooter
            leftButtonProps={{
              label: "Decline",
              variant: "outline",
              onClick: () => handleSubmit(false),
              disabled: isProcessing,
              children: isProcessing && (
                <div className="flex items-center">
                  <span className="mr-2">Declining</span>
                  <Spinner size="xs" variant="dark" />
                </div>
              ),
            }}
            rightButtonProps={{
              label: "Approve",
              variant: "primary",
              onClick: () => handleSubmit(true),
              disabled: isProcessing,
              children: isProcessing && (
                <div className="flex items-center">
                  <span className="mr-2">Approving</span>
                  <Spinner size="xs" variant="light" />
                </div>
              ),
            }}
          />
        </DialogContent>
      </Dialog>
    </ActionValidationContext.Provider>
  );
}
