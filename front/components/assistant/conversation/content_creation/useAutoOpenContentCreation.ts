import { isContentCreationFileContentOutput } from "@dust-tt/mcp-types";
import React from "react";

import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { MessageTemporaryState } from "@app/lib/assistant/state/messageReducer";
import type { LightAgentMessageType } from "@app/types";
import { isContentCreationFileContentType, removeNulls } from "@app/types";

interface UseAutoOpenContentCreationProps {
  agentMessageToRender: LightAgentMessageType;
  isLastMessage: boolean;
  messageStreamState: MessageTemporaryState;
}

/**
 * Custom hook to automatically open content creation drawer based on agent message state.
 * Also returns the content creation files that were generated in the agent message.
 *
 * Logic:
 * - Progress notifications (real-time): Always open drawer with updatedAt timestamp.
 * - Generated files (completed): Only open drawer on last message, skip updatedAt.
 */
export function useAutoOpenContentCreation({
  agentMessageToRender,
  isLastMessage,
  messageStreamState,
}: UseAutoOpenContentCreationProps) {
  const { openPanel } = useConversationSidePanelContext();

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

  // Get content creation files from progress notifications.
  const contentCreationFilesFromProgress = React.useMemo(
    () =>
      removeNulls(
        Array.from(messageStreamState.actionProgress.entries()).map(
          ([, progress]) => {
            const output = progress.progress?.data.output;
            if (isContentCreationFileContentOutput(output)) {
              return output;
            }
            return null;
          }
        )
      ),
    [messageStreamState.actionProgress]
  );

  // Get completed content creation files from generatedFiles.
  const completedContentCreationFiles = React.useMemo(
    () =>
      agentMessageToRender.generatedFiles.filter((file) =>
        isContentCreationFileContentType(file.contentType)
      ),
    [agentMessageToRender.generatedFiles]
  );

  React.useEffect(() => {
    // Handle progress notifications - always open drawer (supports generated->progress refresh).
    if (contentCreationFilesFromProgress.length > 0) {
      const [firstFile] = contentCreationFilesFromProgress;
      if (firstFile?.fileId) {
        lastOpenedFileIdRef.current = firstFile.fileId;
        // Always use updatedAt for real-time updates to trigger refresh.
        openPanel({
          type: "content_creation",
          fileId: firstFile.fileId,
          timestamp: firstFile.updatedAt,
        });
      }
    }
    // Handle completed files - only open drawer on last message.
    else if (completedContentCreationFiles.length > 0 && isLastMessage) {
      const [firstFile] = completedContentCreationFiles;
      const isNotAlreadyOpenedOnFile =
        lastOpenedFileIdRef.current !== firstFile.fileId;
      if (firstFile?.fileId && isNotAlreadyOpenedOnFile) {
        lastOpenedFileIdRef.current = firstFile.fileId;
        // Skip updatedAt for completed files since they're final state.
        openPanel({
          type: "content_creation",
          fileId: firstFile.fileId,
        });
      }
    }
  }, [
    contentCreationFilesFromProgress,
    completedContentCreationFiles,
    isLastMessage,
    openPanel,
  ]);

  // Reset tracking when message changes.
  React.useEffect(() => {
    lastOpenedFileIdRef.current = null;
  }, [agentMessageToRender.sId]);

  return {
    contentCreationFiles: completedContentCreationFiles,
  };
}
