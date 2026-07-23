import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { isInteractiveContentType } from "@app/types/files";
import React from "react";

interface UseAutoOpenFilesPanelProps {
  isLastMessage: boolean;
  agentMessage: AgentMessageWithStreaming;
  // When the same message is opening an interactive content file (a Frame) in
  // the side panel, defer to it instead of stealing the panel for the file
  // explorer. Owned by useAutoOpenInteractiveContent, the single source of
  // truth for that decision.
  deferToInteractiveContent: boolean;
}

/**
 * Auto-opens the file explorer panel when the agent generates regular files
 * (non-image, non-interactive-content) on the last message.
 */
export function useAutoOpenFilesPanel({
  isLastMessage,
  agentMessage,
  deferToInteractiveContent,
}: UseAutoOpenFilesPanelProps) {
  const { openPanel, currentPanel } = useConversationSidePanelContext();
  const isMobile = useIsMobile();

  // Stores the sId of the last message that triggered auto-open, so the comparison itself encodes
  // "already opened for this message" without a separate reset effect.
  const autoOpenedForRef = React.useRef<string | null>(null);

  const regularGeneratedFiles = React.useMemo(
    () =>
      agentMessage.generatedFiles.filter(
        (file) => !file.hidden && !isInteractiveContentType(file.contentType)
      ),
    [agentMessage.generatedFiles]
  );

  React.useEffect(() => {
    if (
      isMobile ||
      regularGeneratedFiles.length === 0 ||
      !isLastMessage ||
      autoOpenedForRef.current === agentMessage.sId ||
      currentPanel === "files" ||
      deferToInteractiveContent
    ) {
      return;
    }

    autoOpenedForRef.current = agentMessage.sId;
    openPanel({ type: "files" });
  }, [
    regularGeneratedFiles,
    deferToInteractiveContent,
    isLastMessage,
    agentMessage.sId,
    openPanel,
    currentPanel,
    isMobile,
  ]);
}
