import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { isInteractiveContentFileContentOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getFileNameFromScopedPath,
  getFilePreviewDirectivePaths,
} from "@app/lib/markdown/file_preview";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { isInteractiveContentType } from "@app/types/files";
import { removeNulls } from "@app/types/shared/utils/general";
import React from "react";

interface UseAutoOpenSidePanelProps {
  isLastMessage: boolean;
  agentMessage: AgentMessageWithStreaming;
}

// The agent can steer which frame opens by referencing it with a
// `:preview_file` directive in the message — an explicit "open this one"
// signal that is present in the message content from the start, unlike the
// streaming/generated file lists which populate as tools run. When a directive
// names one of the candidate frames, prefer it over whichever frame merely
// streamed first. Matched by filename, which is unambiguous here since a
// message's frames have distinct names. Falls back to the first frame.
function preferDirectiveFrame<
  T extends { fileId: string | null; title: string },
>(files: T[], preferredFrameNames: Set<string>): T | undefined {
  if (preferredFrameNames.size > 0) {
    const preferred = files.find((file) => preferredFrameNames.has(file.title));
    if (preferred) {
      return preferred;
    }
  }
  return files[0];
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

  // Frame filenames the agent asked to open via `:preview_file` directives.
  const preferredFrameNames = React.useMemo(
    () =>
      new Set(
        Array.from(
          getFilePreviewDirectivePaths(agentMessage.content ?? "")
        ).map(getFileNameFromScopedPath)
      ),
    [agentMessage.content]
  );

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

  // Reset interactive tracking when the message changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  React.useEffect(() => {
    lastOpenedFileIdRef.current = null;
  }, [agentMessage.sId]);

  // Single effect with explicit priority: interactive content (1) > file explorer (2).
  React.useEffect(() => {
    if (isMobile) {
      return;
    }

    // Priority 1: interactive content drawer (covers streaming and completed states).
    if (interactiveFilesFromProgress.length > 0) {
      const firstFile = preferDirectiveFrame(
        interactiveFilesFromProgress,
        preferredFrameNames
      );
      if (firstFile?.fileId) {
        lastOpenedFileIdRef.current = firstFile.fileId;
        openPanel({
          type: "interactive_content",
          fileId: firstFile.fileId,
          timestamp: firstFile.updatedAt,
        });
      }
      return;
    }

    if (completedInteractiveFiles.length > 0 && isLastMessage) {
      const firstFile = preferDirectiveFrame(
        completedInteractiveFiles,
        preferredFrameNames
      );
      if (
        firstFile?.fileId &&
        lastOpenedFileIdRef.current !== firstFile.fileId
      ) {
        lastOpenedFileIdRef.current = firstFile.fileId;
        openPanel({ type: "interactive_content", fileId: firstFile.fileId });
      }
      return;
    }

    // Priority 2: file explorer — only when no interactive content is taking the panel.
    if (
      regularGeneratedFiles.length === 0 ||
      !isLastMessage ||
      autoOpenedFilesForRef.current === agentMessage.sId ||
      currentPanel === "files"
    ) {
      return;
    }

    autoOpenedFilesForRef.current = agentMessage.sId;
    openPanel({ type: "files" });
  }, [
    completedInteractiveFiles,
    interactiveFilesFromProgress,
    preferredFrameNames,
    regularGeneratedFiles,
    isLastMessage,
    agentMessage.sId,
    openPanel,
    currentPanel,
    isMobile,
  ]);

  return { interactiveFiles: completedInteractiveFiles };
}
