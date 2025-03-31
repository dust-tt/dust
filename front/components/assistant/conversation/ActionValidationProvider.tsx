import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { createContext, useContext, useEffect, useState } from "react";

import type { ActionConfigurationType } from "@app/lib/actions/types/agent";
import { hashMCPInputParams } from "@app/lib/actions/utils";

type ActionValidationContextType = {
  showValidationDialog: (props: {
    workspaceId: string;
    messageId: string;
    conversationId: string;
    action: ActionConfigurationType;
    inputs: Record<string, string | boolean | number>;
  }) => void;
};

// Pending validation requests, keyed by message ID
export type PendingValidationRequestType = {
  workspaceId: string;
  messageId: string;
  conversationId: string;
  action: ActionConfigurationType;
  inputs: Record<string, string | boolean | number>;
};

export const ActionValidationContext = createContext<
  ActionValidationContextType | undefined
>(undefined);

export function useActionValidation() {
  const context = useContext(ActionValidationContext);
  if (!context) {
    throw new Error(
      "useActionValidation must be used within an ActionValidationProvider"
    );
  }
  return context;
}

export function ActionValidationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [validationQueue, setValidationQueue] = useState<
    PendingValidationRequestType[]
  >([]);

  const [currentValidation, setCurrentValidation] =
    useState<PendingValidationRequestType | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (currentValidation) {
      setIsDialogOpen(true);
    }
  }, [currentValidation]);

  // Process the next item in the queue when current validation is completed
  useEffect(() => {
    if (
      !isProcessing &&
      validationQueue.length > 0 &&
      !currentValidation &&
      !isDialogOpen
    ) {
      const nextValidation = validationQueue[0];
      const newQueue = validationQueue.slice(1);

      setValidationQueue(newQueue);
      setCurrentValidation(nextValidation);
      setErrorMessage(null);
    }
  }, [isProcessing, validationQueue, currentValidation, isDialogOpen]);

  const handleApprove = async () => {
    if (!currentValidation) {
      return;
    }

    const inputsHash = hashMCPInputParams(currentValidation.inputs);

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      const response = await fetch(
        `/api/w/${currentValidation.workspaceId}/assistant/conversations/${currentValidation.conversationId}/messages/${currentValidation.messageId}/validate-action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actionId: currentValidation.action.id,
            approved: true,
            paramsHash: inputsHash,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to approve action: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Error approving action:", error);
      setErrorMessage("Failed to approve action. Please try again.");
      return;
    } finally {
      setIsProcessing(false);
    }

    setIsDialogOpen(false);
    setCurrentValidation(null);
  };

  const handleReject = async () => {
    if (!currentValidation) {
      return;
    }

    const inputsHash = hashMCPInputParams(currentValidation.inputs);

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      const response = await fetch(
        `/api/w/${currentValidation.workspaceId}/assistant/conversations/${currentValidation.conversationId}/messages/${currentValidation.messageId}/validate-action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actionId: currentValidation.action.id,
            approved: false,
            paramsHash: inputsHash,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to reject action: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Error rejecting action:", error);
      setErrorMessage("Failed to reject action. Please try again.");
      return;
    } finally {
      setIsProcessing(false);
    }

    setIsDialogOpen(false);
    setCurrentValidation(null);
  };

  const showValidationDialog = (props: {
    workspaceId: string;
    messageId: string;
    conversationId: string;
    action: ActionConfigurationType;
    inputs: Record<string, string | boolean | number>;
  }) => {
    setValidationQueue((prevQueue) => [...prevQueue, props]);
    setErrorMessage(null);
  };

  // Handle manual dialog close
  const handleDialogClose = (open: boolean) => {
    // Only handle rejection if the dialog is being closed (open is false)
    // and we're not currently processing an action
    if (!open && !isProcessing && currentValidation) {
      void handleReject();
    }

    // Only update dialog state if not processing
    if (!isProcessing) {
      setIsDialogOpen(open);
    }
  };

  return (
    <ActionValidationContext.Provider value={{ showValidationDialog }}>
      {children}

      <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Action Validation Required</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              <div>
                <span className="font-medium">Action:</span>{" "}
                {currentValidation?.action.name}
              </div>
              <div>
                <span className="font-medium">Inputs:</span>
                <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-2 text-sm dark:bg-slate-950">
                  {JSON.stringify(currentValidation?.inputs, null, 2)}
                </pre>
              </div>
              <div>Do you want to allow this action to proceed?</div>

              {validationQueue.length > 0 && (
                <div className="mt-2 text-sm font-medium text-blue-500">
                  {validationQueue.length} more action
                  {validationQueue.length > 1 ? "s" : ""} in queue
                </div>
              )}

              {errorMessage && (
                <div className="mt-2 text-sm font-medium text-red-500">
                  {errorMessage}
                </div>
              )}
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Reject",
              variant: "outline",
              onClick: handleReject,
              disabled: isProcessing,
              children: isProcessing ? (
                <div className="flex items-center">
                  <span className="mr-2">Rejecting</span>
                  <Spinner size="xs" variant="dark" />
                </div>
              ) : undefined,
            }}
            rightButtonProps={{
              label: "Approve",
              variant: "primary",
              onClick: handleApprove,
              disabled: isProcessing,
              children: isProcessing ? (
                <div className="flex items-center">
                  <span className="mr-2">Approving</span>
                  <Spinner size="xs" variant="light" />
                </div>
              ) : undefined,
            }}
          />
        </DialogContent>
      </Dialog>
    </ActionValidationContext.Provider>
  );
}
