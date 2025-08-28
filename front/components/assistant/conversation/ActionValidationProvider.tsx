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

type ValidationQueueItem = {
  message?: LightAgentMessageType;
  validationRequest: MCPActionValidationRequest;
};

function useValidationQueue({
  pendingValidations,
}: {
  pendingValidations: MCPActionValidationRequest[];
}) {
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
      setValidationQueue((prevQueue) => {
        const existingIndex = prevQueue.findIndex(
          (v) => v.validationRequest.actionId === validationRequest.actionId
        );

        // If the action is not in the queue, add it.
        // If the action is in the queue, replace it with the new one.
        return existingIndex === -1
          ? [...prevQueue, { validationRequest, message }]
          : prevQueue.map((item, index) =>
              index === existingIndex ? { validationRequest, message } : item
            );
      });
    },
    []
  );

  const shiftValidationQueue = useCallback(() => {
    setValidationQueue((prevQueue) => prevQueue.slice(1));
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

  const { validationQueue, enqueueValidation, shiftValidationQueue } =
    useValidationQueue({ pendingValidations });

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Count of already validated actions.
  // used to keep track of the current page in the dialog and the total number of pages.
  const [validatedActions, setValidatedActions] = useState(0);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [neverAskAgain, setNeverAskAgain] = useState(false);
  const [submitStatus, setSubmitStatus] =
    useState<MCPValidationOutputType | null>(null);

  const { validateAction, isValidating } = useValidateAction({
    owner,
    conversation,
    onError: setErrorMessage,
  });

  useNavigationLock(isDialogOpen);

  // Open the dialog when there are pending validations and the dialog is not open.
  useEffect(() => {
    if (validationQueue.length > 0 && !isDialogOpen) {
      setValidatedActions(0);
      setIsDialogOpen(true);
    } else if (validationQueue.length === 0 && isDialogOpen && !isValidating) {
      setIsDialogOpen(false);
    }
  }, [validationQueue.length, isDialogOpen, isValidating]);

  const submitValidation = async (status: MCPValidationOutputType) => {
    setSubmitStatus(status);
    if (!validationQueue.length) {
      return;
    }

    const currentValidation = validationQueue[0];

    const { validationRequest, message } = currentValidation;
    const result = await validateAction({
      validationRequest,
      message,
      approved:
        status === "approved" && neverAskAgain ? "always_approved" : status,
    });

    if (!result.success) {
      return;
    }

    setSubmitStatus(null);
    setNeverAskAgain(false);
    setErrorMessage(null);

    shiftValidationQueue();
    setValidatedActions((c) => c + 1);
  };

  const showValidationDialog = useCallback(() => {
    if (!isDialogOpen && validationQueue.length > 0) {
      setValidatedActions(0);
      setIsDialogOpen(true);
    }
  }, [isDialogOpen, validationQueue.length]);

  const hasPendingValidations = validationQueue.length > 0;
  const totalPendingValidations = validationQueue.length;

  const pages = useMemo(() => {
    const totalCount = validatedActions + validationQueue.length;
    if (totalCount === 0) {
      return [];
    }

    const current = validationQueue[0];
    if (!current) {
      return [];
    }

    const { validationRequest } = current;
    const hasDetails =
      validationRequest?.inputs &&
      Object.keys(validationRequest.inputs).length > 0;

    return Array.from({ length: totalCount }, (_, index) => ({
      id: index.toString(),
      title: "Tool Validation Required",
      icon: validationRequest.metadata.icon
        ? getIcon(validationRequest.metadata.icon)
        : ActionPieChartIcon,
      content: (
        <div className="flex flex-col gap-4 text-foreground dark:text-foreground-night">
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
  }, [validationQueue, errorMessage, neverAskAgain, validatedActions]);

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
        {pages.length > 0 && (
          <MultiPageDialogContent
            pages={pages}
            currentPageId={validatedActions.toString()}
            onPageChange={() => {}}
            hideCloseButton
            size="lg"
            isAlertDialog
            showNavigation={true}
            showHeaderNavigation={false}
            footerContent={
              <div className="flex flex-row justify-end gap-2">
                <Button
                  variant="outline"
                  label="Decline"
                  onClick={() => submitValidation("rejected")}
                  disabled={isValidating}
                  isLoading={submitStatus === "rejected"}
                >
                  Decline
                </Button>
                <Button
                  variant="highlight"
                  label="Allow"
                  autoFocus
                  onClick={() => submitValidation("approved")}
                  disabled={isValidating}
                  isLoading={submitStatus === "approved"}
                >
                  Allow
                </Button>
              </div>
            }
          />
        )}
      </MultiPageDialog>
    </ActionValidationContext.Provider>
  );
}
