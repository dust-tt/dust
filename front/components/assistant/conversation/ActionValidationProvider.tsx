import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { createContext, useContext, useEffect,useState } from "react";

import type { ActionConfigurationType } from "@app/lib/actions/types/agent";

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
  // Queue of validation requests
  const [validationQueue, setValidationQueue] = useState<
    PendingValidationRequestType[]
  >([]);

  // Current validation being processed
  const [currentValidation, setCurrentValidation] =
    useState<PendingValidationRequestType | null>(null);

  // Dialog open state - controlled separately from currentValidation
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // When currentValidation changes, update dialog open state
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
      // Take the next item from the queue
      const nextValidation = validationQueue[0];
      const newQueue = validationQueue.slice(1);

      setValidationQueue(newQueue);
      setCurrentValidation(nextValidation);
      setErrorMessage(null);
    }
  }, [isProcessing, validationQueue, currentValidation, isDialogOpen]);

  const hashInputParams = (params: Record<string, any>): string => {
    if (!params || Object.keys(params).length === 0) {
      return "no_params";
    }

    // Sort keys to ensure consistent hashing
    const sortedParams = Object.keys(params)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = params[key];
          return acc;
        },
        {} as Record<string, any>
      );

    return require("crypto")
      .createHash("sha256")
      .update(JSON.stringify(sortedParams.query))
      .digest("hex")
      .substring(0, 16);
  };

  // Function to handle approval of the action
  const handleApprove = async () => {
    if (!currentValidation) {
      return;
    }

    const inputsHash = hashInputParams(currentValidation.inputs);

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      // Call API to approve the action
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

    // Successfully processed - close dialog and clear current validation
    setIsDialogOpen(false);
    setCurrentValidation(null);
  };

  // Function to handle rejection of the action
  const handleReject = async () => {
    if (!currentValidation) {
      return;
    }

    const inputsHash = hashInputParams(currentValidation.inputs);

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      // Call API to reject the action
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

    // Successfully processed - close dialog and clear current validation
    setIsDialogOpen(false);
    setCurrentValidation(null);
  };

  // Function to add a validation request to the queue
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
    // TODO: need to handle dialog close

    //if (!open && !isProcessing) {
    // If dialog was manually closed without an action, reject the current validation
    //if (currentValidation) {
    //void handleReject();
    //}
    //}

    // Only update dialog state if not processing
    if (!isProcessing) {
      setIsDialogOpen(open);
    }
  };

  return (
    <ActionValidationContext.Provider value={{ showValidationDialog }}>
      {children}

      {/* Validation Dialog - Using isDialogOpen instead of currentValidation !== null */}
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
