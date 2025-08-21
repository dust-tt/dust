import { Button, Spinner } from "@dust-tt/sparkle";
import { useContext } from "react";
import { useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import {
  useDraftAgent,
  useDraftConversation,
} from "@app/components/agent_builder/hooks/useAgentPreview";
import { ActionValidationProvider } from "@app/components/assistant/conversation/ActionValidationProvider";
import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import {
  GenerationContext,
  GenerationContextProvider,
} from "@app/components/assistant/conversation/GenerationContextProvider";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { useMCPServerViewsContext } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import type { DustError } from "@app/lib/error";
import { useUser } from "@app/lib/swr/user";
import type {
  AgentMention,
  ContentFragmentsType,
  ConversationWithoutContentType,
  LightAgentConfigurationType,
  MentionType,
  Result,
  UserType,
  WorkspaceType,
} from "@app/types";
import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";

import type { AgentBuilderFormData } from "./AgentBuilderFormContext";

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
  conversation: ConversationWithoutContentType | null;
  user: UserType;
  owner: WorkspaceType;
  currentPanel: ConversationSidePanelType;
  resetConversation: () => void;
  handleSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragments: ContentFragmentsType
  ) => Promise<Result<undefined, DustError>>;
  setStickyMentions: (mentions: AgentMention[]) => void;
  stickyMentions: AgentMention[];
  draftAgent: LightAgentConfigurationType | null;
  isSavingDraftAgent: boolean;
}

function PreviewContent({
  conversation,
  user,
  owner,
  currentPanel,
  resetConversation,
  handleSubmit,
  setStickyMentions,
  stickyMentions,
  draftAgent,
  isSavingDraftAgent,
}: PreviewContentProps) {
  const generationContext = useContext(GenerationContext);
  const isGenerating =
    generationContext?.generatingMessages.some(
      (m) => m.conversationId === conversation?.sId
    ) ?? false;

  return (
    <>
      <div className={currentPanel ? "hidden" : "flex h-full flex-col"}>
        <div className="flex-1 overflow-y-auto px-4">
          {conversation && (
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
        {conversation && !isGenerating && (
          <div className="flex justify-center px-4">
            <Button
              variant="outline"
              onClick={resetConversation}
              label="Clear conversation"
            />
          </div>
        )}
        <div className="flex-shrink-0 p-4">
          <AssistantInputBar
            disable={isSavingDraftAgent}
            owner={owner}
            onSubmit={handleSubmit}
            stickyMentions={stickyMentions}
            conversationId={conversation?.sId ?? null}
            additionalAgentConfiguration={draftAgent ?? undefined}
            actions={["attachment"]}
            disableAutoFocus
            isFloating={false}
          />
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

export function AgentBuilderPreview() {
  const { owner } = useAgentBuilderContext();
  const { user } = useUser();
  const { getValues } = useFormContext<AgentBuilderFormData>();
  const { isMCPServerViewsLoading } = useMCPServerViewsContext();

  const { currentPanel } = useConversationSidePanelContext();

  const hasContent =
    !!getValues("instructions").trim() || getValues("actions").length > 0;

  const {
    draftAgent,
    getDraftAgent,
    isSavingDraftAgent,
    draftCreationFailed,
    stickyMentions,
    setStickyMentions,
  } = useDraftAgent();

  const { conversation, handleSubmit, resetConversation } =
    useDraftConversation({
      draftAgent,
      getDraftAgent,
    });

  // Show loading spinner only when the first time we create a draft agent. After that the spinner is shown
  // inside the button in the input bar. This way we don't have to unmount the conversation viewer every time.
  const showLoader =
    !draftAgent && (isMCPServerViewsLoading || isSavingDraftAgent);

  const renderContent = () => {
    if (!hasContent) {
      return (
        <EmptyState
          message="Ready to test your agent?"
          description="Add some instructions or actions to your agent to start testing it here."
        />
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
        user={user!}
        owner={owner}
        currentPanel={currentPanel}
        resetConversation={resetConversation}
        handleSubmit={handleSubmit}
        setStickyMentions={setStickyMentions}
        stickyMentions={stickyMentions}
        draftAgent={draftAgent}
        isSavingDraftAgent={isSavingDraftAgent}
      />
    );
  };

  return (
    <div className="flex h-full w-full flex-col" aria-label="Agent preview">
      <ActionValidationProvider owner={owner} conversation={conversation}>
        <GenerationContextProvider>{renderContent()}</GenerationContextProvider>
      </ActionValidationProvider>
    </div>
  );
}
