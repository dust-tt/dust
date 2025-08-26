import {
  ActionPieChartIcon,
  Button,
  Checkbox,
  CodeBlock,
  CollapsibleComponent,
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
import { getIcon } from "@app/lib/actions/mcp_icons";
import { useBlockedActions } from "@app/lib/swr/blocked_actions";
import type {
  ConversationWithoutContentType,
  LightAgentMessageType,
  LightWorkspaceType,
  MCPActionValidationRequest,
} from "@app/types";
import { asDisplayName } from "@app/types";
<<<<<<< HEAD

type ValidationQueueItem = {
  message?: LightAgentMessageType;
  validationRequest: MCPActionValidationRequest;
};
=======
>>>>>>> 83961b732 (working multipage)

function useValidationQueue({
  pendingValidations,
}: {
  pendingValidations: MCPActionValidationRequest[];
}) {
<<<<<<< HEAD
  const [validationQueue, setValidationQueue] = useState<ValidationQueueItem[]>(
    []
  );

  useEffect(() => {
    if (pendingValidations.length > 0) {
      setValidationQueue((prevQueue) => {
        const existingIds = new Set(
          prevQueue.map((v) => v.validationRequest.actionId)
        );
        const newItems = pendingValidations
          .filter((v) => !existingIds.has(v.actionId))
          .map((validationRequest) => ({ validationRequest }));
        return [...prevQueue, ...newItems];
      });
=======
  const [validationQueue, setValidationQueue] = useState<
    MCPActionValidationRequest[]
  >([]);

  useEffect(() => {
    if (pendingValidations.length > 0) {
      setValidationQueue(pendingValidations);
>>>>>>> 83961b732 (working multipage)
    }
  }, [pendingValidations]);

  const enqueueValidation = useCallback(
    ({
      validationRequest,
    }: {
      message: LightAgentMessageType;
      validationRequest: MCPActionValidationRequest;
    }) => {
      setValidationQueue((prevQueue) => {
        // Check if validation already exists in queue
        const exists = prevQueue.some(
<<<<<<< HEAD
          (v) => v.validationRequest.actionId === validationRequest.actionId
        );

        if (!exists) {
          return [...prevQueue, { validationRequest, message }];
=======
          (v) => v.actionId === validationRequest.actionId
        );

        if (!exists) {
          return [...prevQueue, validationRequest];
>>>>>>> 83961b732 (working multipage)
        }

        return prevQueue;
      });
    },
    []
  );

<<<<<<< HEAD
  const shiftValidationQueue = useCallback(() => {
    setValidationQueue((prevQueue) => prevQueue.slice(1));
=======
  const shiftValidationQueue = useCallback((actionId: string) => {
    setValidationQueue((prevQueue) =>
      prevQueue.filter((v) => v.actionId !== actionId)
    );
>>>>>>> 83961b732 (working multipage)
  }, []);

  return {
    validationQueue,
    enqueueValidation,
    shiftValidationQueue,
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
  const { blockedActions, mutate: mutateBlockedActions } = useBlockedActions({
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

  const { validationQueue, enqueueValidation, shiftValidationQueue } =
    useValidationQueue({ pendingValidations });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
<<<<<<< HEAD
  const [initialQueueLength, setInitialQueueLength] = useState(0);

=======
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
>>>>>>> 83961b732 (working multipage)
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [neverAskAgain, setNeverAskAgain] = useState(false);

  const { validateAction, isValidating } = useValidateAction({
    owner,
    conversation,
    onError: setErrorMessage,
  });

  useNavigationLock(isDialogOpen);

  useEffect(() => {
    if (validationQueue.length > 0 && !isDialogOpen) {
      setInitialQueueLength(validationQueue.length);
      setIsDialogOpen(true);
    }
  }, [validationQueue.length, isDialogOpen]);

  const submitValidation = async (status: MCPValidationOutputType) => {
    if (!validationQueue.length) {
      return;
    }

<<<<<<< HEAD
    const currentValidation = validationQueue[0];
=======
    const currentValidation = validationQueue[currentPageIndex];

    if (!currentValidation) {
      return;
    }
>>>>>>> 83961b732 (working multipage)

    if (!currentValidation) {
      return;
    }

    const { validationRequest, message } = currentValidation;
    const result = await validateAction({
      validationRequest: currentValidation,
      approved:
        status === "approved" && neverAskAgain ? "always_approved" : status,
    });

<<<<<<< HEAD
    if (!result.success) {
=======
    if (result.success) {
      setNeverAskAgain(false);
      setErrorMessage(null);
    }

    setErrorMessage(null);
    setIsProcessing(true);

    const response = await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${currentValidation.conversationId}/messages/${currentValidation.messageId}/validate-action`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actionId: currentValidation.actionId,
          approved:
            status === "approved" && neverAskAgain ? "always_approved" : status,
        }),
      }
    );

    setIsProcessing(false);

    if (!response.ok) {
      setErrorMessage("Failed to assess action approval. Please try again.");
>>>>>>> 83961b732 (working multipage)
      return;
    }

    await mutateBlockedActions();

    setNeverAskAgain(false);
    setErrorMessage(null);

    const remainingAfterShift = validationQueue.length - 1;

<<<<<<< HEAD
    shiftValidationQueue();

    if (remainingAfterShift === 0) {
      setIsDialogOpen(false);
      setInitialQueueLength(0);
=======
    const isLastValidation = validationQueue.length === 1;

    shiftValidationQueue(currentValidation.actionId);

    if (isLastValidation) {
      // No more validations, close the dialog
      setIsDialogOpen(false);
    } else {
      // Move to the next page if available
      const nextPageIndex = currentPageIndex + 1;
      if (nextPageIndex < validationQueue.length - 1) {
        setCurrentPageIndex(nextPageIndex);
      } else {
        // If we're at the last page, go to the first page
        setCurrentPageIndex(0);
      }
>>>>>>> 83961b732 (working multipage)
    }
  };

  const handleSubmit = (approved: MCPValidationOutputType) => {
    void submitValidation(approved);
  };

  const showValidationDialog = useCallback(() => {
    if (!isDialogOpen) {
      setIsDialogOpen(true);
<<<<<<< HEAD
=======
      setCurrentPageIndex(0);
>>>>>>> 83961b732 (working multipage)
    }
  }, [isDialogOpen]);

  const hasPendingValidations = validationQueue.length > 0;
  const totalPendingValidations = validationQueue.length;

  const pages = useMemo(() => {
<<<<<<< HEAD
    if (!validationQueue.length || initialQueueLength === 0) {
      return [];
    }

    const { validationRequest } = validationQueue[0];
    const hasDetails =
      validationRequest?.inputs &&
      Object.keys(validationRequest.inputs).length > 0;

    return Array.from({ length: initialQueueLength }, (_, index) => ({
      id: index.toString(),
      title: "Tool Validation Required",
      description: "Review and approve the tool usage request",
      icon: validationRequest.metadata.icon
        ? getIcon(validationRequest.metadata.icon)
        : ActionPieChartIcon,
      content: (
        <div className="flex flex-col gap-4">
          <div>
            Allow{" "}
            <span className="font-semibold">
              @{validationRequest.metadata.agentName}
            </span>{" "}
            to use the tool{" "}
            <span className="font-semibold">
              {asDisplayName(validationRequest.metadata.toolName)}
            </span>{" "}
            from{" "}
            <span className="font-semibold">
              {asDisplayName(validationRequest.metadata.mcpServerName)}
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
                      {JSON.stringify(validationRequest.inputs, null, 2)}
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
          {validationRequest.stake === "low" && (
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
      ),
    }));
  }, [validationQueue, errorMessage, neverAskAgain, initialQueueLength]);
=======
    const basePages = validationQueue.map((validationRequest, index) => {
      const hasDetails =
        validationRequest?.inputs &&
        Object.keys(validationRequest.inputs).length > 0;

      return {
        id: index.toString(),
        title: `Tool Validation Required (${index + 1})`,
        description: "Review and approve the tool usage request",
        icon: validationRequest.metadata.icon
          ? getIcon(validationRequest.metadata.icon)
          : ActionPieChartIcon,
        content: (
          <div className="flex flex-col gap-4">
            <div>
              Allow{" "}
              <span className="font-semibold">
                @{validationRequest.metadata.agentName}
              </span>{" "}
              to use the tool{" "}
              <span className="font-semibold">
                {asDisplayName(validationRequest.metadata.toolName)}
              </span>{" "}
              from{" "}
              <span className="font-semibold">
                {asDisplayName(validationRequest.metadata.mcpServerName)}
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
                        {JSON.stringify(validationRequest.inputs, null, 2)}
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
            {validationRequest.stake === "low" && (
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
        ),
      };
    });

    return basePages;
  }, [validationQueue, errorMessage, neverAskAgain]);
>>>>>>> 83961b732 (working multipage)

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

      <MultiPageDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
<<<<<<< HEAD
        {pages.length > 0 && (
          <MultiPageDialogContent
            pages={pages}
            currentPageId={Math.max(
              0,
              initialQueueLength - validationQueue.length
            ).toString()}
            onPageChange={() => {}}
            size="lg"
            isAlertDialog
            showNavigation={true}
            showHeaderNavigation={false}
            footerContent={
              <div className="flex flex-row justify-end gap-2">
                <Button
                  variant="outline"
                  label="Decline"
                  onClick={() => handleSubmit("rejected")}
                  disabled={isValidating}
                >
                  Decline
                </Button>
                <Button
                  variant="highlight"
                  label="Allow"
                  autoFocus
                  onClick={() => handleSubmit("approved")}
                  disabled={isValidating}
                >
                  Allow
                </Button>
              </div>
            }
          />
        )}
=======
        <MultiPageDialogContent
          pages={pages}
          currentPageId={currentPageIndex.toString()}
          onPageChange={(pageId) => setCurrentPageIndex(parseInt(pageId))}
          size="lg"
          isAlertDialog
          showNavigation={validationQueue.length > 1}
          footerContent={
            <div className="flex flex-row justify-end gap-2">
              <Button
                variant="outline"
                label="Decline"
                onClick={() => handleSubmit("rejected")}
                disabled={isProcessing || isValidating}
              >
                Decline
              </Button>
              <Button
                variant="highlight"
                label="Allow"
                autoFocus
                onClick={() => handleSubmit("approved")}
                disabled={isProcessing || isValidating}
              >
                Allow
              </Button>
            </div>
          }
        />
>>>>>>> 83961b732 (working multipage)
      </MultiPageDialog>
    </ActionValidationContext.Provider>
  );
}
