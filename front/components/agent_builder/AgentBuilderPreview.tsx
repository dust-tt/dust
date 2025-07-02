import { Spinner } from "@dust-tt/sparkle";
import React, { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  usePreviewAgent,
  useTryAgentCore,
} from "@app/components/agent_builder/hooks/useAgentPreview";
import { ActionValidationProvider } from "@app/components/assistant/conversation/ActionValidationProvider";
import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { useUser } from "@app/lib/swr/user";

function EmptyState({
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

export const AgentBuilderPreview = React.memo(function AgentBuilderPreview() {
  const { owner } = useAgentBuilderContext();
  const { user } = useUser();
  const form = useFormContext<AgentBuilderFormData>();
  const formData = form.watch();
  const { draftAgent, isSavingDraftAgent, createDraftAgent } =
    usePreviewAgent();
  const { conversation, stickyMentions, setStickyMentions, handleSubmit } =
    useTryAgentCore({
      owner,
      user,
      agent: draftAgent,
      createDraftAgent,
    });

  const hasContent = useMemo(() => {
    return formData.instructions?.trim() || formData.actions.length > 0;
  }, [formData.instructions, formData.actions.length]);

  // Determine what to render in the main content area
  const renderContent = () => {
    if (!user) {
      return <LoadingState message="Loading user..." />;
    }

    if (!hasContent) {
      return (
        <EmptyState
          message="Ready to test your agent?"
          description="Add some instructions or actions to your agent to start testing it here."
        />
      );
    }

    if (isSavingDraftAgent && !draftAgent) {
      return <LoadingState message="Preparing your agent..." />;
    }

    if (!draftAgent && !isSavingDraftAgent) {
      return (
        <EmptyState
          message="Unable to create preview"
          description="There was an issue creating a preview of your agent. Try making a small change to refresh."
        />
      );
    }

    // Show the actual conversation interface with proper flex layout
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto">
          {conversation ? (
            <ConversationViewer
              owner={owner}
              user={user}
              conversationId={conversation.sId}
              onStickyMentionsChange={setStickyMentions}
              isInModal
              key={conversation.sId}
            />
          ) : (
            <EmptyState
              message="Start a conversation"
              description="Send a message below to test your agent and see how it responds."
            />
          )}
        </div>
        <div className="flex-shrink-0 border-t border-border">
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
    <div
      className="flex h-full w-full flex-col"
      role="main"
      aria-label="Agent preview"
    >
      <ActionValidationProvider owner={owner}>
        <GenerationContextProvider>{renderContent()}</GenerationContextProvider>
      </ActionValidationProvider>
    </div>
  );
});
