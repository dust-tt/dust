import { AgentActionsPanelHeader } from "@app/components/assistant/conversation/actions/AgentActionsPanelHeader";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ContentMessage, Markdown, XMarkIcon } from "@dust-tt/sparkle";

export function ThinkingPanel() {
  const { onPanelClosed, thinkingContent: content } =
    useConversationSidePanelContext();

  if (!content) {
    return null;
  }

  return (
    <div className="flex h-full flex-col bg-background dark:bg-background-night">
      <AgentActionsPanelHeader
        title="Thinking"
        closeIcon={XMarkIcon}
        onClose={onPanelClosed}
      />
      <div className="flex-1 overflow-y-auto p-4 pb-12">
        <ContentMessage variant="primary" size="lg">
          <Markdown
            content={content}
            isStreaming={false}
            forcedTextSize="text-sm"
            textColor="text-muted-foreground dark:text-muted-foreground-night"
            isLastMessage={false}
          />
        </ContentMessage>
      </div>
    </div>
  );
}
