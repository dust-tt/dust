import React from "react";

import { useInteractiveContentContext } from "@app/components/assistant/conversation/content/InteractiveContentContext";
import { isInteractiveFileContentOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { MessageTemporaryState } from "@app/lib/assistant/state/messageReducer";
import type { LightAgentMessageType } from "@app/types";
import { isInteractiveFileContentType, removeNulls } from "@app/types";

interface UseAutoOpenInteractiveContentProps {
  agentMessageToRender: LightAgentMessageType;
  isLastMessage: boolean;
  messageStreamState: MessageTemporaryState;
}

/**
 * Custom hook to automatically open interactive content drawer based on agent message state.
 * Also returns the interactive files that were generated in the agent message.
 *
 * Logic:
 * - Progress notifications (real-time): Always open drawer with updatedAt timestamp.
 * - Generated files (completed): Only open drawer on last message, skip updatedAt.
 */
export function useAutoOpenInteractiveContent({
  agentMessageToRender,
  isLastMessage,
  messageStreamState,
}: UseAutoOpenInteractiveContentProps) {
  const { openContent } = useInteractiveContentContext();

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

  // Get interactive files from progress notifications.
  const interactiveFilesFromProgress = React.useMemo(
    () =>
      removeNulls(
        Array.from(messageStreamState.actionProgress.entries()).map(
          ([, progress]) => {
            const output = progress.progress?.data.output;
            if (isInteractiveFileContentOutput(output)) {
              return output;
            }
            return null;
          }
        )
      ),
    [messageStreamState.actionProgress]
  );

  // Get completed interactive files from generatedFiles.
  const completedInteractiveFiles = React.useMemo(
    () =>
      agentMessageToRender.generatedFiles.filter((file) =>
        isInteractiveFileContentType(file.contentType)
      ),
    [agentMessageToRender.generatedFiles]
  );

  React.useEffect(() => {
    // Handle progress notifications - always open drawer (supports generated->progress refresh).
    if (interactiveFilesFromProgress.length > 0) {
      const [firstFile] = interactiveFilesFromProgress;
      if (firstFile?.fileId) {
        lastOpenedFileIdRef.current = firstFile.fileId;
        // Always use updatedAt for real-time updates to trigger refresh.
        openContent(firstFile.fileId, firstFile.updatedAt);
      }
    }
    // Handle completed files - only open drawer on last message.
    else if (completedInteractiveFiles.length > 0 && isLastMessage) {
      const [firstFile] = completedInteractiveFiles;
      const isNotAlreadyOpenedOnFile =
        lastOpenedFileIdRef.current !== firstFile.fileId;
      if (firstFile?.fileId && isNotAlreadyOpenedOnFile) {
        lastOpenedFileIdRef.current = firstFile.fileId;
        // Skip updatedAt for completed files since they're final state.
        openContent(firstFile.fileId);
      }
    }
  }, [
    interactiveFilesFromProgress,
    completedInteractiveFiles,
    isLastMessage,
    openContent,
  ]);

  // Reset tracking when message changes.
  React.useEffect(() => {
    lastOpenedFileIdRef.current = null;
  }, [agentMessageToRender.sId]);

  return {
    interactiveFiles: completedInteractiveFiles,
  };
}
