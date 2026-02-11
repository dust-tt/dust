import { Spinner } from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef } from "react";
import { useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import {
  useDraftAgent,
  useDraftConversation,
} from "@app/components/agent_builder/hooks/useAgentPreview";
import { usePreviewPanelContext } from "@app/components/agent_builder/PreviewPanelContext";
import { TrialMessageUsage } from "@app/components/app/TrialMessageUsage";
import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationViewer } from "@app/components/assistant/conversation/ConversationViewer";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { DustError } from "@app/lib/error";
import { isFreeTrialPhonePlan } from "@app/lib/plans/plan_codes";
import { useWorkspaceActiveSubscription } from "@app/lib/swr/workspaces";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import type { Result } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";

interface EmptyStateProps {
  message: string;
  description: string;
}

function EmptyState({ message, description }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <div className="px-4 text-center">
        <div className="mb-2 text-lg font-medium text-foreground">
          {message}
        </div>
        <div className="max-w-sm text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

interface LoadingStateProps {
  message: string;
}

function LoadingState({ message }: LoadingStateProps) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <div className="flex items-center gap-3">
        <Spinner />
        <span className="text-muted-foreground">{message}</span>
      </div>
    </div>
  );
}

interface PreviewContentProps {
  conversation?: ConversationWithoutContentType;
  user: UserType | null;
  owner: WorkspaceType;
  currentPanel: ConversationSidePanelType;
  resetConversation: () => void;
  createConversation: (
    input: string,
    mentions: RichMention[],
    contentFragments: ContentFragmentsType
  ) => Promise<Result<undefined, DustError>>;
  draftAgent: LightAgentConfigurationType | null;
  isSavingDraftAgent: boolean;
  isTrialPlan: boolean;
  isAdmin: boolean;
}

function PreviewContent({
  conversation,
  user,
  owner,
  currentPanel,
  resetConversation,
  createConversation,
  draftAgent,
  isSavingDraftAgent,
  isTrialPlan,
  isAdmin,
}: PreviewContentProps) {
  return (
    <>
      <div className={currentPanel ? "hidden" : "flex h-full flex-col"}>
        <div className="flex-1 overflow-y-auto">
          {isTrialPlan && (
            <div className="px-4 pt-4">
              <TrialMessageUsage isAdmin={isAdmin} workspaceId={owner.sId} />
            </div>
          )}
          {conversation && user && (
            <ConversationViewer
              owner={owner}
              user={user}
              conversationId={conversation.sId}
              agentBuilderContext={{
                draftAgent: draftAgent ?? undefined,
                isSubmitting: isSavingDraftAgent,
                resetConversation,
                actionsToShow: ["attachment"],
              }}
              key={conversation.sId}
            />
          )}
          {!conversation && (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div className="text-base font-medium text-muted-foreground">
                Preview your agent here
              </div>
            </div>
          )}
        </div>

        {!conversation && (
          <div className="mx-4 flex-shrink-0 py-4">
            <InputBar
              isSubmitting={isSavingDraftAgent}
              owner={owner}
              user={user}
              onSubmit={createConversation}
              stickyMentions={
                draftAgent ? [toRichAgentMentionType(draftAgent)] : []
              }
              draftKey={`agent-${draftAgent?.name}-builder-preview`}
              actions={["attachment"]}
              disableAutoFocus
              isFloating={false}
              shouldUseDraft={false}
            />
          </div>
        )}
      </div>

      {conversation && (
        <ConversationSidePanelContent
          conversation={conversation}
          owner={owner}
          currentPanel={currentPanel}
        />
      )}
    </>
  );
}

export function AgentBuilderPreview() {
  const { owner, isAdmin } = useAgentBuilderContext();
  const { user } = useAuth();
  const { activeSubscription } = useWorkspaceActiveSubscription({ owner });
  const isTrialPlan =
    activeSubscription && isFreeTrialPhonePlan(activeSubscription.plan.code);
  const { isMCPServerViewsLoading } = useMCPServerViewsContext();
  const { isPreviewPanelOpen } = usePreviewPanelContext();

  const { currentPanel } = useConversationSidePanelContext();

  const watchedFields = useWatch({
    name: ["instructions", "actions", "agentSettings.name"],
  });

  const [instructions, actions, agentName] = watchedFields;

  const hasContent = useMemo(
    () => !!instructions?.trim() || !!actions?.length,
    [instructions, actions]
  );

  const {
    draftAgent,
    setDraftAgent,
    createDraftAgent,
    getDraftAgent,
    isSavingDraftAgent,
    draftCreationFailed,
  } = useDraftAgent();

  const { conversation, createConversation, resetConversation } =
    useDraftConversation({
      draftAgent,
      getDraftAgent,
    });

  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const isUpdatingDraftRef = useRef(false);

  useEffect(() => {
    const handleDraftUpdate = async () => {
      if (
        !isPreviewPanelOpen ||
        isMCPServerViewsLoading ||
        isUpdatingDraftRef.current
      ) {
        return;
      }

      // Create an initial draft if none exists and we have content
      if (!draftAgent && hasContent) {
        isUpdatingDraftRef.current = true;
        const newDraft = await createDraftAgent();
        if (newDraft) {
          setDraftAgent(newDraft);
        }
        isUpdatingDraftRef.current = false;
        return;
      }

      // Update existing draft if agent name changed (with debouncing)
      // Normalize names for comparison (empty string becomes "Preview")
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const normalizedCurrentName = agentName?.trim() || "Preview";
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const normalizedDraftName = draftAgent?.name?.trim() || "Preview";

      if (draftAgent && normalizedCurrentName !== normalizedDraftName) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(async () => {
          isUpdatingDraftRef.current = true;
          const newDraft = await createDraftAgent();
          if (newDraft) {
            setDraftAgent(newDraft);
          }
          isUpdatingDraftRef.current = false;
        }, 500);
      }
    };

    void handleDraftUpdate();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    isPreviewPanelOpen,
    isMCPServerViewsLoading,
    draftAgent,
    hasContent,
    agentName,
    createDraftAgent,
    setDraftAgent,
  ]);

  // Show loading spinner only when the first time we create a draft agent. After that the spinner is shown
  // inside the button in the input bar. This way we don't have to unmount the conversation viewer every time.
  const showLoader =
    !draftAgent && (isMCPServerViewsLoading || isSavingDraftAgent);

  const renderContent = () => {
    if (!hasContent) {
      return (
        <div className="flex h-full flex-1 items-center justify-center px-6 text-center">
          <div className="text-base font-medium text-muted-foreground">
            Preview your agent here
          </div>
        </div>
      );
    }

    if (draftCreationFailed) {
      return (
        <EmptyState
          message="Unable to create preview"
          description="There was an issue creating a preview of your agent. Try making a small change to refresh."
        />
      );
    }

    if (showLoader) {
      return <LoadingState message="Preparing your agent..." />;
    }

    return (
      <PreviewContent
        conversation={conversation}
        user={user}
        owner={owner}
        currentPanel={currentPanel}
        resetConversation={resetConversation}
        createConversation={createConversation}
        draftAgent={draftAgent}
        isSavingDraftAgent={isSavingDraftAgent}
        isTrialPlan={!!isTrialPlan}
        isAdmin={isAdmin}
      />
    );
  };

  return (
    <div className="flex h-full w-full flex-col" aria-label="Agent preview">
      <BlockedActionsProvider owner={owner} conversation={conversation}>
        <GenerationContextProvider>{renderContent()}</GenerationContextProvider>
      </BlockedActionsProvider>
    </div>
  );
}
