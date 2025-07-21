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
    // Handle progress notifications - always open drawer (real-time updates).
    if (interactiveFilesFromProgress.length > 0) {
      const [firstFile] = interactiveFilesFromProgress;
      if (firstFile?.fileId) {
        // Always use updatedAt for real-time updates to trigger refresh.
        openContent(firstFile.fileId, firstFile.updatedAt);
      }
    }
    // Handle completed files - only open drawer on last message.
    else if (completedInteractiveFiles.length > 0 && isLastMessage) {
      const [firstFile] = completedInteractiveFiles;
      if (firstFile?.fileId) {
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

  return {
    interactiveFiles: completedInteractiveFiles,
  };
}
