import { Spinner } from "@dust-tt/sparkle";
import React from "react";
import { useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { usePreviewAgent, useTryAgentCore } from "@app/components/agent_builder/hooks/useAgentPreview";
import { ActionValidationProvider } from "@app/components/assistant/conversation/ActionValidationProvider";
import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { useMCPServerViewsContext } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { useUser } from "@app/lib/swr/user";

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

export function AgentBuilderPreview() {
  const { owner } = useAgentBuilderContext();
  const { user } = useUser();
  const { isMCPServerViewsLoading } = useMCPServerViewsContext();

  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });
  const name = useWatch<AgentBuilderFormData, "agentSettings.name">({
    name: "agentSettings.name",
  });

  const {
    draftAgent,
    isSavingDraftAgent,
    draftCreationFailed,
    createDraftAgent,
  } = usePreviewAgent();
  const { conversation, stickyMentions, setStickyMentions, handleSubmit } =
    useTryAgentCore({
      owner,
      user,
      agent: draftAgent,
      createDraftAgent,
    });

  const hasContent = instructions.trim();

  const renderContent = () => {
    if (!hasContent || !name) {
      return (
        <EmptyState
          message="Ready to test your agent?"
          description="Add some instructions or actions to your agent to start testing it here."
        />
      );
    }

    if (
      isMCPServerViewsLoading ||
      isSavingDraftAgent ||
      (!draftAgent && !draftCreationFailed)
    ) {
      return <LoadingState message="Preparing your agent..." />;
    }

    if (!draftAgent && draftCreationFailed) {
      return (
        <EmptyState
          message="Unable to create preview"
          description="There was an issue creating a preview of your agent. Try making a small change to refresh."
        />
      );
    }

    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          {conversation && user && (
            <ConversationViewer
              owner={owner}
              user={user}
              conversationId={conversation.sId}
              onStickyMentionsChange={setStickyMentions}
              isInModal
              key={conversation.sId}
            />
          )}
        </div>
        <div className="flex-shrink-0 p-4">
          <AssistantInputBar
            disableButton={isSavingDraftAgent}
            owner={owner}
            onSubmit={handleSubmit}
            stickyMentions={stickyMentions}
            conversationId={conversation?.sId || null}
            additionalAgentConfiguration={draftAgent ?? undefined}
            actions={["attachment"]}
            disableAutoFocus
            isFloating={false}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col" aria-label="Agent preview">
      <ActionValidationProvider owner={owner}>
        <GenerationContextProvider>{renderContent()}</GenerationContextProvider>
      </ActionValidationProvider>
    </div>
  );
}
