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

import type { ActionConfigurationType } from "@app/lib/actions/types/agent";
import { hashMCPInputParams } from "@app/lib/actions/utils";

type ActionValidationContextType = {
  showValidationDialog: (props: {
    workspaceId: string;
    messageId: string;
    conversationId: string;
    action: ActionConfigurationType;
    inputs: Record<string, unknown>;
  }) => void;
};

// Pending validation requests, keyed by message ID
export type PendingValidationRequestType = {
  workspaceId: string;
  messageId: string;
  conversationId: string;
  action: ActionConfigurationType;
  inputs: Record<string, unknown>;
};

export const ActionValidationContext =
  createContext<ActionValidationContextType>({} as ActionValidationContextType);

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

  const handle = async (approved: boolean) => {
    if (!currentValidation) {
      return;
    }

    const inputsHash = hashMCPInputParams(currentValidation.inputs);

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
          paramsHash: inputsHash,
        }),
      }
    );

    if (!response.ok) {
      setErrorMessage(
        `Failed to ${approved ? "approve" : "reject"} action. Please try again.`
      );
      return;
    }

    setIsProcessing(false);
    setIsDialogOpen(false);
    setCurrentValidation(null);
  };

  const showValidationDialog = (props: {
    workspaceId: string;
    messageId: string;
    conversationId: string;
    action: ActionConfigurationType;
    inputs: Record<string, unknown>;
  }) => {
    setValidationQueue((prevQueue) => [...prevQueue, props]);
    setErrorMessage(null);
  };

  return (
    <ActionValidationContext.Provider value={{ showValidationDialog }}>
      {children}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
              onClick: () => handle(false),
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
              onClick: () => handle(true),
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
