// Remove ValidationRequirement interface
// Remove overview page

import type { MultiPageDialogPage } from "@dust-tt/sparkle";
import {
  ActionPieChartIcon,
  Checkbox,
  CodeBlock,
  CollapsibleComponent,
  Icon,
  Label,
  Spinner,
} from "@dust-tt/sparkle";
import { MultiPageDialog, MultiPageDialogContent } from "@dust-tt/sparkle";
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
  LightWorkspaceType,
  MCPActionValidationRequest,
} from "@app/types";
import { asDisplayName, pluralize } from "@app/types";

interface ValidationRequirement {
  id: string;
  actionId: string;
  conversationId: string;
  messageId: string;
  toolName: string;
  mcpServerName: string;
  agentName: string;
  inputs: Record<string, unknown>;
  stake?: string;
  icon?: string;
}

interface ActionValidationContextType {
  showValidationDialog: (
    validationRequest?: MCPActionValidationRequest
  ) => void;
  hasPendingValidations: boolean;
  totalPendingValidations: number;
}

const ActionValidationContext =
  createContext<ActionValidationContextType | null>(null);

export function useActionValidationContext() {
  const context = useContext(ActionValidationContext);
  if (!context) {
    throw new Error(
      "useActionValidationContext must be used within ActionValidationProvider"
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

  // Filter blocked actions to only get validation required ones
  // TODO(durable-agents): also display blocked_authentication_required.
  const pendingValidations = useMemo(() => {
    return blockedActions
      .filter((action) => action.status === "blocked_validation_required")
      .map((action) => ({
        id: `${action.actionId}`,
        actionId: action.actionId,
        conversationId: action.conversationId,
        messageId: action.messageId,
        toolName: action.metadata.toolName,
        mcpServerName: action.metadata.mcpServerName,
        agentName: action.metadata.agentName,
        inputs: action.inputs,
        stake: action.stake,
        icon: action.metadata.icon,
      }));
  }, [blockedActions]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPageId, setCurrentPageId] = useState<string>("overview");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [neverAskAgain, setNeverAskAgain] = useState(false);
  const [completedValidations, setCompletedValidations] = useState<Set<string>>(
    new Set()
  );

  useNavigationLock(isDialogOpen);

  // Poll for blocked actions every 2 seconds when conversation is active
  useEffect(() => {
    if (!conversation?.sId) {
      return;
    }

    const interval = setInterval(() => {
      void mutateBlockedActions();
    }, 2000);

    return () => clearInterval(interval);
  }, [conversation?.sId, mutateBlockedActions]);

  // Automatically open dialog when validation requirements become available
  useEffect(() => {
    if (pendingValidations.length > 0 && !isDialogOpen) {
      // Skip overview page if there's only one validation
      if (pendingValidations.length === 1) {
        setCurrentPageId(`validation-${pendingValidations[0].id}`);
      } else {
        setCurrentPageId("overview");
      }
      setIsDialogOpen(true);
      setCompletedValidations(new Set());
      setErrorMessage(null);
    }
  }, [pendingValidations]);

  const sendValidation = useCallback(
    async (
      requirement: ValidationRequirement,
      status: MCPValidationOutputType
    ) => {
      let approved = status;
      if (status === "approved" && neverAskAgain) {
        approved = "always_approved";
      }

      setErrorMessage(null);
      setIsProcessing(true);

      try {
        const response = await fetch(
          `/api/w/${owner.sId}/assistant/conversations/${requirement.conversationId}/messages/${requirement.messageId}/validate-action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              actionId: requirement.actionId,
              approved,
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to assess action approval");
        }

        setCompletedValidations((prev) => new Set([...prev, requirement.id]));
        setNeverAskAgain(false);

        // Revalidate blocked actions to update the UI
        await mutateBlockedActions();

        return true;
      } catch (error) {
        setErrorMessage("Failed to assess action approval. Please try again.");
        return false;
      } finally {
        setIsProcessing(false);
      }
    },
    [owner.sId, neverAskAgain, mutateBlockedActions]
  );

  const handleValidationSubmit = useCallback(
    async (
      requirement: ValidationRequirement,
      approved: MCPValidationOutputType
    ) => {
      const success = await sendValidation(requirement, approved);

      if (!success) {
        return;
      }

      const remainingValidations = pendingValidations.filter(
        (req) => !completedValidations.has(req.id) && req.id !== requirement.id
      );

      if (remainingValidations.length > 0) {
        const nextRequirement = remainingValidations[0];
        setCurrentPageId(`validation-${nextRequirement.id}`);
      } else {
        // All validations completed, close dialog
        setIsDialogOpen(false);
        setCurrentPageId("overview");
        setCompletedValidations(new Set());
      }
    },
    [sendValidation, pendingValidations, completedValidations]
  );

  const showValidationDialog = useCallback(() => {
    if (pendingValidations.length > 0) {
      setIsDialogOpen(true);
      // Skip overview page if there's only one validation
      if (pendingValidations.length === 1) {
        setCurrentPageId(`validation-${pendingValidations[0].id}`);
      } else {
        setCurrentPageId("overview");
      }
      setCompletedValidations(new Set());
      setErrorMessage(null);
    }
  }, [pendingValidations]);

  const hasPendingValidations = pendingValidations.length > 0;
  const totalPendingValidations = pendingValidations.length;

  const dialogPages: MultiPageDialogPage[] = useMemo(() => {
    if (pendingValidations.length === 0) {
      return [];
    }

    const pages: MultiPageDialogPage[] = [
      {
        id: "overview",
        title: "Tool Validation Required",
        description: `${pendingValidations.length} tool${pluralize(pendingValidations.length)} need approval`,
        content: (
          <div className="flex flex-col gap-4">
            <div className="text-sm text-muted-foreground">
              The following tools require your approval before they can be used:
            </div>
            <div className="space-y-3">
              {pendingValidations.map((req, index) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                      {req.icon ? (
                        getAvatarFromIcon(req.icon)
                      ) : (
                        <Icon visual={ActionPieChartIcon} size="sm" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium">
                        {asDisplayName(req.toolName)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        from {asDisplayName(req.mcpServerName)}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {index + 1} of {pendingValidations.length}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ),
      },
    ];

    pendingValidations.forEach((req) => {
      pages.push({
        id: `validation-${req.id}`,
        title: `Validate ${asDisplayName(req.toolName)}`,
        description: `Allow @${req.agentName} to use this tool`,
        content: (
          <div className="flex flex-col gap-4">
            <div>
              Allow <b>@{req.agentName}</b> to use the tool{" "}
              <b>{asDisplayName(req.toolName)}</b> from{" "}
              <b>{asDisplayName(req.mcpServerName)}</b>?
            </div>

            {req.inputs && Object.keys(req.inputs).length > 0 && (
              <CollapsibleComponent
                triggerChildren={
                  <span className="font-medium text-muted-foreground">
                    Details
                  </span>
                }
                contentChildren={
                  <div>
                    <div className="max-h-80 overflow-auto rounded-lg bg-muted">
                      <CodeBlock
                        wrapLongLines
                        className="language-json overflow-y-auto"
                      >
                        {JSON.stringify(req.inputs, null, 2)}
                      </CodeBlock>
                    </div>
                  </div>
                }
              />
            )}

            {errorMessage && (
              <div className="text-sm font-medium text-warning-800">
                {errorMessage}
              </div>
            )}

            {req.stake === "low" && (
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
      });
    });

    return pages;
  }, [pendingValidations, errorMessage, neverAskAgain]);

  const isOverviewPage = currentPageId === "overview";
  const currentValidationRequirement = isOverviewPage
    ? null
    : pendingValidations.find(
        (req) => currentPageId === `validation-${req.id}`
      );

  function getDialogButtons() {
    if (isOverviewPage) {
      return {
        leftButton: {
          label: "Cancel",
          variant: "outline" as const,
          onClick: () => setIsDialogOpen(false),
        },
        rightButton: {
          label: "Start Review",
          variant: "highlight" as const,
          onClick: () => {
            const firstRequirement = pendingValidations[0];
            if (firstRequirement) {
              setCurrentPageId(`validation-${firstRequirement.id}`);
            }
          },
        },
      };
    }

    if (currentValidationRequirement) {
      return {
        leftButton: {
          label: "Decline",
          variant: "outline" as const,
          onClick: () =>
            handleValidationSubmit(currentValidationRequirement, "rejected"),
          disabled: isProcessing,
          children: isProcessing ? (
            <div className="flex items-center">
              <span className="mr-2">Declining</span>
              <Spinner size="xs" variant="dark" />
            </div>
          ) : undefined,
        },
        rightButton: {
          label: "Allow",
          variant: "highlight" as const,
          onClick: () =>
            handleValidationSubmit(currentValidationRequirement, "approved"),
          disabled: isProcessing,
          autoFocus: true,
          children: isProcessing ? (
            <div className="flex items-center">
              <span className="mr-2">Approving</span>
              <Spinner size="xs" variant="light" />
            </div>
          ) : undefined,
        },
      };
    }

    return {};
  }

  const dialogButtons = getDialogButtons();

  return (
    <ActionValidationContext.Provider
      value={{
        showValidationDialog,
        hasPendingValidations,
        totalPendingValidations,
      }}
    >
      {children}

      {dialogPages.length > 0 && (
        <MultiPageDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <MultiPageDialogContent
            pages={dialogPages}
            currentPageId={currentPageId}
            onPageChange={setCurrentPageId}
            size="lg"
            showNavigation={pendingValidations.length > 1}
            showHeaderNavigation={pendingValidations.length > 1}
            addFooterSeparator={true}
            {...dialogButtons}
          />
        </MultiPageDialog>
      )}
    </ActionValidationContext.Provider>
  );
}
