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

  const hasAutoOpenedRef = React.useRef(false);

  // Reset per message so a new message can trigger auto-open again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  React.useEffect(() => {
    hasAutoOpenedRef.current = false;
  }, [agentMessage.sId]);

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
      !hasAutoOpenedRef.current &&
      currentPanel !== "files"
    ) {
      hasAutoOpenedRef.current = true;
      openPanel({ type: "files" });
    }
  }, [regularGeneratedFiles, isLastMessage, openPanel, currentPanel]);
}
