import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useCopilotPanelContext } from "@app/components/agent_builder/CopilotPanelContext";
import { TrialMessageUsage } from "@app/components/app/TrialMessageUsage";
import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationViewer } from "@app/components/assistant/conversation/ConversationViewer";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { isFreeTrialPhonePlan } from "@app/lib/plans/plan_codes";
import { useUser } from "@app/lib/swr/user";
import { useWorkspaceActiveSubscription } from "@app/lib/swr/workspaces";
import type {
  ConversationWithoutContentType,
  UserType,
  WorkspaceType,
} from "@app/types";
import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";

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

interface CopilotContentProps {
  conversation: ConversationWithoutContentType;
  user: UserType | null;
  owner: WorkspaceType;
  currentPanel: ConversationSidePanelType;
  resetConversation: () => void;
  isTrialPlan: boolean;
  isAdmin: boolean;
  clientSideMCPServerIds: string[];
}

function CopilotContent({
  conversation,
  user,
  owner,
  currentPanel,
  resetConversation,
  isTrialPlan,
  isAdmin,
  clientSideMCPServerIds,
}: CopilotContentProps) {
  return (
    <>
      <div className={currentPanel ? "hidden" : "flex h-full flex-col"}>
        <div className="flex-1 overflow-y-auto">
          {isTrialPlan && (
            <div className="px-4 pt-4">
              <TrialMessageUsage isAdmin={isAdmin} workspaceId={owner.sId} />
            </div>
          )}
          {user && (
            <ConversationViewer
              owner={owner}
              user={user}
              conversationId={conversation.sId}
              agentBuilderContext={{
                isSubmitting: false,
                resetConversation,
                actionsToShow: [],
                clientSideMCPServerIds,
              }}
              key={conversation.sId}
            />
          )}
        </div>
      </div>

      <ConversationSidePanelContent
        conversation={conversation}
        owner={owner}
        currentPanel={currentPanel}
      />
    </>
  );
}

export function AgentBuilderCopilot() {
  const { owner, isAdmin } = useAgentBuilderContext();
  const { user } = useUser();
  const { activeSubscription } = useWorkspaceActiveSubscription({ owner });
  const isTrialPlan =
    activeSubscription && isFreeTrialPhonePlan(activeSubscription.plan.code);

  const { currentPanel } = useConversationSidePanelContext();

  const {
    conversation,
    isCreatingConversation,
    creationFailed,
    startConversation,
    resetConversation,
    clientSideMCPServerIds,
  } = useCopilotPanelContext();

  // Auto-start conversation when component mounts
  /* eslint-disable react-you-might-not-need-an-effect/no-derived-state */
  useEffect(() => {
    void startConversation();
  }, [startConversation]);
  /* eslint-enable react-you-might-not-need-an-effect/no-derived-state */

  const renderContent = () => {
    if (creationFailed) {
      return (
        <EmptyState
          message="Unable to start copilot"
          description="There was an issue starting the copilot session. Please try again later."
        />
      );
    }

    if (isCreatingConversation || !conversation) {
      return <LoadingState message="Starting copilot session..." />;
    }

    return (
      <CopilotContent
        conversation={conversation}
        user={user}
        owner={owner}
        currentPanel={currentPanel}
        resetConversation={resetConversation}
        isTrialPlan={!!isTrialPlan}
        isAdmin={isAdmin}
        clientSideMCPServerIds={clientSideMCPServerIds}
      />
    );
  };

  return (
    <div className="flex h-full w-full flex-col" aria-label="Agent copilot">
      <BlockedActionsProvider
        owner={owner}
        conversation={conversation ?? undefined}
      >
        <GenerationContextProvider>
          <div className="flex-1 overflow-hidden">{renderContent()}</div>
        </GenerationContextProvider>
      </BlockedActionsProvider>
    </div>
  );
}
