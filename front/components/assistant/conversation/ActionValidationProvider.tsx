import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { createContext, useContext, useState } from "react";

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
  const [pendingValidation, setPendingValidation] =
    useState<PendingValidationRequestType | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Function to handle approval of the action
  const handleApprove = async () => {
    if (!pendingValidation) {return;}

    setErrorMessage(null);
    setIsProcessing(true);
    try {
      // Call API to approve the action
      const response = await fetch(
        `/api/w/${pendingValidation.workspaceId}/assistant/conversations/${pendingValidation.conversationId}/messages/${pendingValidation.messageId}/validate-action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actionId: pendingValidation.action.id,
            approved: true,
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

    // Only clear pending validation if the API call was successful
    setPendingValidation(null);
  };

  // Function to handle rejection of the action
  const handleReject = async () => {
    if (!pendingValidation) {return;}

    setErrorMessage(null);
    setIsProcessing(true);
    try {
      // Call API to reject the action
      const response = await fetch(
        `/api/w/${pendingValidation.workspaceId}/assistant/conversations/${pendingValidation.conversationId}/messages/${pendingValidation.messageId}/validate-action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actionId: pendingValidation.action.id,
            approved: false,
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

    // Only clear pending validation if the API call was successful
    setPendingValidation(null);
  };

  // Function to show the validation dialog
  const showValidationDialog = (props: {
    workspaceId: string;
    messageId: string;
    conversationId: string;
    action: ActionConfigurationType;
    inputs: Record<string, string | boolean | number>;
  }) => {
    setPendingValidation(props);
    setErrorMessage(null);
  };

  return (
    <ActionValidationContext.Provider value={{ showValidationDialog }}>
      {children}

      {/* Validation Dialog */}
      <Dialog
        open={pendingValidation !== null}
        onOpenChange={(open) => {
          if (!open && !isProcessing) {
            // If dialog is closed manually, treat as rejection
            if (pendingValidation) {
              void handleReject();
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
                {pendingValidation?.action.name}
              </div>
              <div>
                <span className="font-medium">Inputs:</span>
                <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-2 text-sm">
                  {JSON.stringify(pendingValidation?.inputs, null, 2)}
                </pre>
              </div>
              <div>Do you want to allow this action to proceed?</div>

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
