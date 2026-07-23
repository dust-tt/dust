import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { isInteractiveContentFileContentOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { isInteractiveContentType } from "@app/types/files";
import { removeNulls } from "@app/types/shared/utils/general";
import React from "react";

interface UseAutoOpenSidePanelProps {
  isLastMessage: boolean;
  agentMessage: AgentMessageWithStreaming;
}

/**
 * Auto-opens the appropriate side panel when the agent generates files.
 *
 * Priority (highest first):
 *   1. Interactive content (Frame/slideshow) — opens the interactive content drawer.
 *   2. Regular files — opens the file explorer, but only when no interactive
 *      content is being opened for this message.
 *
 * Returns the completed interactive files so callers can render the content panel.
 */
export function useAutoOpenSidePanel({
  isLastMessage,
  agentMessage,
}: UseAutoOpenSidePanelProps) {
  const { openPanel, currentPanel } = useConversationSidePanelContext();
  const isMobile = useIsMobile();

  // Track the last opened fileId to prevent double-opening glitch.
  //
  // Problem: Progress notifications and generated files represent the same content but have
  // different hash formats:
  // - Progress notifications: "fileId@updatedAt" (includes timestamp for real-time refresh)
  // - Generated files: "fileId" (no updatedAt)
  //
  // Without tracking, the hook would open the drawer twice:
  // 1. Progress phase: opens with "fileId@timestamp"
  // 2. Completion phase: progress clears, opens again with "fileId"
  //
  // Solution: Track opened fileIds to prevent progress→generated blinks while still
  // allowing generated→progress refreshes (when file is updated with new timestamp).
  const lastOpenedFileIdRef = React.useRef<string | null>(null);

  // Track which message sId last triggered file-panel auto-open to open only once per message.
  const autoOpenedFilesForRef = React.useRef<string | null>(null);

  const interactiveFilesFromProgress = React.useMemo(
    () =>
      removeNulls(
        Array.from(agentMessage.streaming.actionProgress.entries()).map(
          ([, progress]) => {
            const output = progress.progress?._meta.data.output;
            if (isInteractiveContentFileContentOutput(output)) {
              return output;
            }
            return null;
          }
        )
      ),
    [agentMessage.streaming.actionProgress]
  );

  const completedInteractiveFiles = React.useMemo(
    () =>
      agentMessage.generatedFiles.filter((file) =>
        isInteractiveContentType(file.contentType)
      ),
    [agentMessage.generatedFiles]
  );

  const regularGeneratedFiles = React.useMemo(
    () =>
      agentMessage.generatedFiles.filter(
        (file) => !file.hidden && !isInteractiveContentType(file.contentType)
      ),
    [agentMessage.generatedFiles]
  );

  // Priority 1: interactive content drawer (covers both streaming and completed states).
  React.useEffect(() => {
    if (isMobile) {
      return;
    }

    if (interactiveFilesFromProgress.length > 0) {
      const [firstFile] = interactiveFilesFromProgress;
      if (firstFile?.fileId) {
        lastOpenedFileIdRef.current = firstFile.fileId;
        openPanel({
          type: "interactive_content",
          fileId: firstFile.fileId,
          timestamp: firstFile.updatedAt,
        });
      }
    } else if (completedInteractiveFiles.length > 0 && isLastMessage) {
      const [firstFile] = completedInteractiveFiles;
      if (
        firstFile?.fileId &&
        lastOpenedFileIdRef.current !== firstFile.fileId
      ) {
        lastOpenedFileIdRef.current = firstFile.fileId;
        openPanel({ type: "interactive_content", fileId: firstFile.fileId });
      }
    }
  }, [
    completedInteractiveFiles,
    interactiveFilesFromProgress,
    isLastMessage,
    openPanel,
    isMobile,
  ]);

  // Reset interactive tracking when the message changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  React.useEffect(() => {
    lastOpenedFileIdRef.current = null;
  }, [agentMessage.sId]);

  // Whether this message is opening (or will open) the interactive content panel.
  // Used to suppress the lower-priority file-explorer auto-open.
  const willOpenInteractiveContent =
    !isMobile &&
    (interactiveFilesFromProgress.length > 0 ||
      (completedInteractiveFiles.length > 0 && isLastMessage));

  // Priority 2: file explorer — only when no interactive content is taking the panel.
  React.useEffect(() => {
    if (
      isMobile ||
      regularGeneratedFiles.length === 0 ||
      !isLastMessage ||
      autoOpenedFilesForRef.current === agentMessage.sId ||
      currentPanel === "files" ||
      willOpenInteractiveContent
    ) {
      return;
    }

    autoOpenedFilesForRef.current = agentMessage.sId;
    openPanel({ type: "files" });
  }, [
    regularGeneratedFiles,
    willOpenInteractiveContent,
    isLastMessage,
    agentMessage.sId,
    openPanel,
    currentPanel,
    isMobile,
  ]);

  return { interactiveFiles: completedInteractiveFiles };
}
