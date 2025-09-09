import { useDustAPI } from "@app/shared/lib/dust_api";
import { asDisplayName } from "@app/shared/lib/utils";
import type {
  BlockedActionExecutionType,
  MCPToolStakeLevelPublicType,
  MCPValidationMetadataPublicType,
  MCPValidationOutputPublicType,
} from "@dust-tt/client";
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
import { createContext, useCallback, useMemo, useState } from "react";

type ActionValidationContextType = {
  showValidationDialog: (validationRequest: {
    actionId: string;
    conversationId: string;
    inputs: Record<string, unknown>;
    messageId: string;
    metadata: MCPValidationMetadataPublicType;
    stake?: MCPToolStakeLevelPublicType;
    workspaceId: string;
  }) => void;
  hasBlockedActions: boolean;
  totalBlockedActions: number;
};

// Pending validation requests, keyed by message ID
export type PendingValidationRequestType = {
  actionId: string;
  conversationId: string;
  inputs: Record<string, unknown>;
  messageId: string;
  metadata: MCPValidationMetadataPublicType;
  stake?: MCPToolStakeLevelPublicType;
  workspaceId: string;
};

export const ActionValidationContext =
  createContext<ActionValidationContextType>({} as ActionValidationContextType);

type BlockedActionQueueItem = {
  blockedAction: BlockedActionExecutionType;
};

function useBlockedActionsQueue() {
  const [blockedActionsQueue, setBlockedActionsQueue] = useState<
    BlockedActionQueueItem[]
  >([]);

  const enqueueBlockedAction = useCallback(
    (blockedAction: BlockedActionExecutionType) => {
      setBlockedActionsQueue((prevQueue) => {
        const exists = prevQueue.some(
          (v) => v.blockedAction.actionId === blockedAction.actionId
        );
        return exists ? prevQueue : [...prevQueue, { blockedAction }];
      });
    },
    []
  );

  const clearQueue = useCallback(() => {
    setBlockedActionsQueue([]);
  }, []);

  return { blockedActionsQueue, enqueueBlockedAction, clearQueue };
}

export function ActionValidationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { blockedActionsQueue, enqueueBlockedAction, clearQueue } =
    useBlockedActionsQueue();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [neverAskAgain, setNeverAskAgain] = useState(false);
  const [submitStatus, setSubmitStatus] =
    useState<MCPValidationOutputPublicType | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  const dustAPI = useDustAPI();

  const pendingValidations = useMemo(() => {
    return blockedActionsQueue.filter(
      (a) => a.blockedAction.status === "blocked_validation_required"
    );
  }, [blockedActionsQueue]);

  const hasBlockedActions = pendingValidations.length > 0;
  const totalBlockedActions = pendingValidations.length;

  const pages = useMemo(() => {
    return pendingValidations.map((item) => {
      const { blockedAction } = item;
      const hasDetails =
        blockedAction.inputs && Object.keys(blockedAction.inputs).length > 0;

      return {
        id: `validation-${blockedAction.actionId}`,
        title: "Tool Validation Required",
        icon: ActionPieChartIcon,
        content: (
          <div className="flex flex-col gap-4 text-muted-foreground dark:text-muted-foreground-night">
            <div>
              Allow{" "}
              <span className="font-semibold">
                @{blockedAction.metadata.agentName}
              </span>{" "}
              to use the tool{" "}
              <span className="font-semibold">
                {asDisplayName(blockedAction.metadata.toolName)}
              </span>{" "}
              from{" "}
              <span className="font-semibold">
                {asDisplayName(blockedAction.metadata.mcpServerName)}
              </span>
              ?
            </div>
            {hasDetails && (
              <CollapsibleComponent
                triggerChildren={<span className="font-medium">Details</span>}
                contentChildren={
                  <div>
                    <div className="max-h-80 overflow-auto rounded-lg bg-muted dark:bg-muted-night">
                      <CodeBlock
                        wrapLongLines
                        className="language-json overflow-y-auto"
                      >
                        {JSON.stringify(blockedAction.inputs, null, 2)}
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
            {blockedAction.stake === "low" && (
              <div className="mt-5">
                <Label className="copy-sm flex w-fit cursor-pointer flex-row items-center gap-2 py-2 pr-2 font-normal">
                  <Checkbox
                    checked={neverAskAgain}
                    onCheckedChange={(check) => setNeverAskAgain(!!check)}
                  />
                  <span>Always allow this tool</span>
                </Label>
              </div>
            )}
          </div>
        ),
      };
    });
  }, [pendingValidations, errorMessage, neverAskAgain]);

  const submitValidation = useCallback(
    async (status: MCPValidationOutputPublicType) => {
      setSubmitStatus(status);

      if (pendingValidations.length === 0) {
        return;
      }

      // Use currentPageIndex to get the correct action from the queue
      const currentBlockedAction =
        pendingValidations[currentPageIndex].blockedAction;
      const approved =
        status === "approved" && neverAskAgain ? "always_approved" : status;

      const res = await dustAPI.validateAction({
        conversationId: currentBlockedAction.conversationId,
        messageId: currentBlockedAction.messageId,
        actionId: currentBlockedAction.actionId,
        approved,
      });

      if (res.isErr()) {
        setErrorMessage("Failed to assess action approval. Please try again.");
        setSubmitStatus(null);
        return;
      }

      setErrorMessage(null);
      setSubmitStatus(null);
      setNeverAskAgain(false);

      // Check if this was the last action
      const isLastAction = currentPageIndex >= pages.length - 1;
      if (isLastAction) {
        setIsDialogOpen(false);
        clearQueue();
        setCurrentPageIndex(0);
      } else {
        setCurrentPageIndex((prev) => prev + 1);
      }
    },
    [
      dustAPI,
      neverAskAgain,
      pendingValidations,
      currentPageIndex,
      pages,
      clearQueue,
    ]
  );

  const showValidationDialog = useCallback(
    (validationRequest: PendingValidationRequestType) => {
      setErrorMessage(null);

      const blockedAction: BlockedActionExecutionType = {
        actionId: validationRequest.actionId,
        conversationId: validationRequest.conversationId,
        inputs: validationRequest.inputs,
        messageId: validationRequest.messageId,
        metadata: validationRequest.metadata,
        stake: validationRequest.stake ?? "low",
        status: "blocked_validation_required",
      };

      enqueueBlockedAction(blockedAction);
      setIsDialogOpen(true);
    },
    [enqueueBlockedAction]
  );

  const currentPageId = useMemo(() => {
    if (pages.length === 0 || currentPageIndex >= pages.length) {
      return "";
    }
    return pages[currentPageIndex].id;
  }, [pages, currentPageIndex]);

  return (
    <ActionValidationContext.Provider
      value={{
        showValidationDialog,
        hasBlockedActions,
        totalBlockedActions,
      }}
    >
      {children}

      <MultiPageDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        {pages.length > 0 && (
          <MultiPageDialogContent
            pages={pages}
            currentPageId={currentPageId}
            onPageChange={() => {}}
            hideCloseButton={true}
            size="md"
            isAlertDialog
            showNavigation={true}
            showHeaderNavigation={false}
            footerContent={
              <div className="flex flex-row justify-end gap-2">
                <Button
                  variant="outline"
                  label="Decline"
                  onClick={() => void submitValidation("rejected")}
                  isLoading={submitStatus === "rejected"}
                />
                <Button
                  variant="highlight"
                  label="Allow"
                  autoFocus
                  onClick={() => void submitValidation("approved")}
                  isLoading={submitStatus === "approved"}
                />
              </div>
            }
          />
        )}
      </MultiPageDialog>
    </ActionValidationContext.Provider>
  );
}
