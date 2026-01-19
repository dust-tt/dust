import { SparklesIcon,Spinner } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import {
  useCopilotAgent,
  useCopilotConversation,
} from "@app/components/agent_builder/hooks/useAgentCopilot";
import { EmptyPlaceholder } from "@app/components/agent_builder/observability/shared/EmptyPlaceholder";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { usePreviewPanelContext } from "@app/components/agent_builder/PreviewPanelContext";
import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { ConversationViewer } from "@app/components/assistant/conversation/ConversationViewer";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { useUser } from "@app/lib/swr/user";

interface AgentBuilderImproveProps {
  agentConfigurationSId: string;
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <div className="flex items-center gap-3">
        <Spinner />
        <span className="text-muted-foreground">{message}</span>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  description,
}: {
  message: string;
  description: string;
}) {
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

export function AgentBuilderImprove({
  agentConfigurationSId,
}: AgentBuilderImproveProps) {
  const { owner } = useAgentBuilderContext();
  const { user } = useUser();
  const { isPreviewPanelOpen } = usePreviewPanelContext();

  const {
    copilotAgent,
    isCreatingCopilotAgent,
    createCopilotAgent,
    copilotCreationFailed,
  } = useCopilotAgent(agentConfigurationSId);

  const {
    conversation,
    isCreatingConversation,
    startConversation,
    resetConversation,
  } = useCopilotConversation({
    copilotAgent,
    createCopilotAgent,
  });

  // Track whether we've already started the conversation.
  const hasStartedRef = useRef(false);

  // Auto-start the conversation when the panel is opened.
  useEffect(() => {
    if (
      isPreviewPanelOpen &&
      !hasStartedRef.current &&
      !conversation &&
      !isCreatingConversation &&
      !isCreatingCopilotAgent
    ) {
      hasStartedRef.current = true;
      void startConversation();
    }
  }, [
    isPreviewPanelOpen,
    conversation,
    isCreatingConversation,
    isCreatingCopilotAgent,
    startConversation,
  ]);

  const renderContent = () => {
    if (copilotCreationFailed) {
      return (
        <ErrorState
          message="Unable to create copilot"
          description="There was an issue creating the improvement copilot. Please try again."
        />
      );
    }

    if (isCreatingCopilotAgent || isCreatingConversation) {
      return <LoadingState message="Starting agent copilot..." />;
    }

    if (!conversation) {
      return (
        <TabContentLayout title="Improve">
          <EmptyPlaceholder
            icon={SparklesIcon}
            title="Ready to improve your agent?"
            description="The copilot will analyze your agent and suggest improvements."
          />
        </TabContentLayout>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          {user && (
            <ConversationViewer
              owner={owner}
              user={user}
              conversationId={conversation.sId}
              agentBuilderContext={{
                draftAgent: copilotAgent ?? undefined,
                isSavingDraftAgent: false,
                resetConversation,
                actionsToShow: [],
              }}
              key={conversation.sId}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col" aria-label="Agent improve">
      <BlockedActionsProvider owner={owner} conversation={conversation}>
        <GenerationContextProvider>{renderContent()}</GenerationContextProvider>
      </BlockedActionsProvider>
    </div>
  );
}
