import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { isInteractiveContentType } from "@app/types/files";
import React from "react";

interface UseAutoOpenFilesPanelProps {
  isLastMessage: boolean;
  agentMessage: AgentMessageWithStreaming;
}

/**
 * Auto-opens the file explorer panel when the agent generates regular files
 * (non-image, non-interactive-content) on the last message.
 */
export function useAutoOpenFilesPanel({
  isLastMessage,
  agentMessage,
}: UseAutoOpenFilesPanelProps) {
  const { openPanel, currentPanel } = useConversationSidePanelContext();

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
      regularGeneratedFiles.length > 0 &&
      isLastMessage &&
      autoOpenedForRef.current !== agentMessage.sId &&
      currentPanel !== "files"
    ) {
      autoOpenedForRef.current = agentMessage.sId;
      openPanel({ type: "files" });
    }
  }, [
    regularGeneratedFiles,
    isLastMessage,
    agentMessage.sId,
    openPanel,
    currentPanel,
  ]);
}
