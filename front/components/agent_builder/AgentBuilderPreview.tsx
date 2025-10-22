import { Spinner } from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef } from "react";
import { useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import {
  useDraftAgent,
  useDraftConversation,
} from "@app/components/agent_builder/hooks/useAgentPreview";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import { usePreviewPanelContext } from "@app/components/agent_builder/PreviewPanelContext";
import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationViewer } from "@app/components/assistant/conversation/ConversationViewer";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import type { EditorMention } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import type { DustError } from "@app/lib/error";
import { useUser } from "@app/lib/swr/user";
import type {
  ContentFragmentsType,
  ConversationWithoutContentType,
  LightAgentConfigurationType,
  Result,
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

interface PreviewContentProps {
  conversation: ConversationWithoutContentType | null;
  user: UserType | null;
  owner: WorkspaceType;
  currentPanel: ConversationSidePanelType;
  resetConversation: () => void;
  createConversation: (
    input: string,
    mentions: EditorMention[],
    contentFragments: ContentFragmentsType
  ) => Promise<Result<undefined, DustError>>;
  draftAgent: LightAgentConfigurationType | null;
  isSavingDraftAgent: boolean;
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
}: PreviewContentProps) {
  return (
    <>
      <div className={currentPanel ? "hidden" : "flex h-full flex-col"}>
        <div className="flex-1 overflow-y-auto">
          {conversation && user && (
            <ConversationViewer
              owner={owner}
              user={user}
              conversationId={conversation.sId}
              agentBuilderContext={{
                draftAgent: draftAgent ?? undefined,
                isSavingDraftAgent,
                resetConversation,
                actionsToShow: ["attachment"],
              }}
              key={conversation.sId}
            />
          )}
        </div>

        {!conversation && (
          <div className="mx-4 flex-shrink-0 py-4">
            <InputBar
              disable={isSavingDraftAgent}
              owner={owner}
              onSubmit={createConversation}
              stickyMentions={
                draftAgent ? [{ configurationId: draftAgent.sId }] : []
              }
              conversationId={null}
              additionalAgentConfiguration={draftAgent ?? undefined}
              actions={["attachment"]}
              disableAutoFocus
              isFloating={false}
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
  const { owner } = useAgentBuilderContext();
  const { user } = useUser();
  const { isMCPServerViewsLoading } = useMCPServerViewsContext();
  const { isPreviewPanelOpen } = usePreviewPanelContext();

  const { currentPanel } = useConversationSidePanelContext();

  const watchedFields = useWatch({
    name: ["instructions", "actions", "agentSettings.name"],
  });

  const [instructions, actions, agentName] = watchedFields;

  const hasContent = useMemo(() => {
    return !!instructions?.trim() || (actions?.length ?? 0) > 0;
  }, [instructions, actions]);

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
        user={user}
        owner={owner}
        currentPanel={currentPanel}
        resetConversation={resetConversation}
        createConversation={createConversation}
        draftAgent={draftAgent}
        isSavingDraftAgent={isSavingDraftAgent}
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
