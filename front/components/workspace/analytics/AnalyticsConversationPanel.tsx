import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import {
  ConversationSidePanelProvider,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationViewer } from "@app/components/assistant/conversation/ConversationViewer";
import { FilePreviewProvider } from "@app/components/assistant/conversation/FilePreviewContext";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import type { VirtuosoMessageListContext } from "@app/components/assistant/conversation/types";
import type { AnalyticsViewInput } from "@app/components/workspace/analytics/analyticsView";
import { useAnalyticsConversation } from "@app/hooks/useAnalyticsConversation";
import { useAnalyticsMCPServer } from "@app/hooks/useAnalyticsMCPServer";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Button, Icon, Robot, Spinner, XClose } from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface AnalyticsConversationPanelHeaderProps {
  onClose: () => void;
}

function AnalyticsConversationPanelHeader({
  onClose,
}: AnalyticsConversationPanelHeaderProps) {
  return (
    <div className="flex h-14 w-full items-center justify-between px-2">
      <div className="flex min-w-0 items-center gap-1.5 px-2">
        <Icon visual={Robot} size="sm" className="shrink-0" />
        <span className="line-clamp-1 text-sm font-medium">Analyst</span>
      </div>
      <Button
        icon={XClose}
        size="sm"
        variant="ghost-secondary"
        tooltip="Close panel"
        onClick={onClose}
      />
    </div>
  );
}

interface AnalyticsConversationPanelBodyProps {
  owner: WorkspaceType;
  user: UserType;
  clientSideMCPServerIds: string[];
  conversation: ConversationType | null;
  isOpen: boolean;
  isCreatingConversation: boolean;
  creationFailed: boolean;
  onRetry: () => void;
  resetConversation: () => void;
}

function AnalyticsConversationPanelBody({
  owner,
  user,
  clientSideMCPServerIds,
  conversation,
  isOpen,
  isCreatingConversation,
  creationFailed,
  onRetry,
  resetConversation,
}: AnalyticsConversationPanelBodyProps) {
  const { currentPanel } = useConversationSidePanelContext();

  // Stub reuse of ConversationViewer's agentBuilderContext slot, whose only
  // fields we need are disableAgentMentions/actionsToShow.
  const analystAgentContext = useMemo<
    VirtuosoMessageListContext["agentBuilderContext"]
  >(
    () => ({
      isSubmitting: false,
      resetConversation,
      actionsToShow: [],
      disableAgentMentions: true,
      disableReactions: true,
    }),
    [resetConversation]
  );

  if (creationFailed) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <div className="flex flex-col items-center gap-3 px-4 text-center">
          <div className="text-lg font-medium text-foreground">
            Unable to start Analyst
          </div>
          <div className="max-w-sm text-muted-foreground">
            The Analyst session could not be started.
          </div>
          <Button variant="outline" label="Try again" onClick={onRetry} />
        </div>
      </div>
    );
  }

  if (isCreatingConversation || !conversation) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <div className="flex items-center gap-3">
          <Spinner size="md" />
          <span className="text-muted-foreground">
            Starting Analyst session...
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={
          currentPanel ? "hidden" : "flex h-full w-full min-h-0 flex-col"
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationViewer
            owner={owner}
            user={user}
            conversationId={conversation.sId}
            disabled={!isOpen}
            agentBuilderContext={analystAgentContext}
            clientSideMCPServerIds={clientSideMCPServerIds}
            key={conversation.sId}
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

export interface AnalyticsConversationPanelProps {
  owner: WorkspaceType;
  user: UserType;
  onClose: () => void;
  isOpen: boolean;
  isFacetsLoading: boolean;
  view: AnalyticsViewInput;
}

/**
 * The Analytics-page conversation panel: a normal, persisted, billed
 * conversation restricted to `@analyst`, rendered as a side panel.
 */
export function AnalyticsConversationPanel({
  owner,
  user,
  onClose,
  isOpen,
  isFacetsLoading,
  view,
}: AnalyticsConversationPanelProps) {
  const {
    conversation,
    isCreatingConversation,
    creationFailed,
    startConversation,
    resetConversation,
  } = useAnalyticsConversation({ owner, user, view });

  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const getView = useCallback(() => viewRef.current, []);

  // Latched rather than tied to `isOpen`: closing the panel does not cancel a running generation,
  // and deregistering under it leaves its `get_analytics_view` call without a subscriber until the
  // MCP request times out. Registering only after a first open still keeps page loads that never
  // open the panel free of an SSE stream.
  const [hasOpenedPanel, setHasOpenedPanel] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setHasOpenedPanel(true);
    }
  }, [isOpen]);

  const analyticsMCPServerId = useAnalyticsMCPServer({
    enabled: hasOpenedPanel,
    getView,
    workspaceId: owner.sId,
  });
  const clientSideMCPServerIds = useMemo(
    () => (analyticsMCPServerId ? [analyticsMCPServerId] : []),
    [analyticsMCPServerId]
  );

  // `ResizableSidePanel` keeps this panel mounted while closed, so a mount effect would bootstrap
  // a conversation on every Analytics page load. Wait for filter resolution too: the opening
  // message names the filters and is never regenerated, so starting early would name raw ids.
  useEffect(() => {
    if (isOpen && !isFacetsLoading) {
      void startConversation();
    }
  }, [isOpen, isFacetsLoading, startConversation]);

  const handleRetry = useCallback(() => {
    resetConversation();
    void startConversation();
  }, [resetConversation, startConversation]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center border-b border-border bg-panel-background/80 backdrop-blur-sm">
        <AnalyticsConversationPanelHeader onClose={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <FilePreviewProvider owner={owner}>
          <ConversationSidePanelProvider>
            <BlockedActionsProvider
              owner={owner}
              conversation={conversation ?? undefined}
            >
              <GenerationContextProvider>
                <AnalyticsConversationPanelBody
                  owner={owner}
                  user={user}
                  clientSideMCPServerIds={clientSideMCPServerIds}
                  conversation={conversation}
                  isOpen={isOpen}
                  isCreatingConversation={isCreatingConversation}
                  creationFailed={creationFailed}
                  onRetry={handleRetry}
                  resetConversation={resetConversation}
                />
              </GenerationContextProvider>
            </BlockedActionsProvider>
          </ConversationSidePanelProvider>
        </FilePreviewProvider>
      </div>
    </div>
  );
}
