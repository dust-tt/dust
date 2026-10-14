import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { isInteractiveContentFileContentOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { useClientType } from "@app/lib/context/clientType";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { isFrameContentType } from "@app/types/files";
import { removeNulls } from "@app/types/shared/utils/general";
import uniqBy from "lodash/uniqBy";
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
 */
export function useAutoOpenSidePanel({
  isLastMessage,
  agentMessage,
}: UseAutoOpenSidePanelProps) {
  const {
    openPanel,
    currentPanel,
    data: panelData,
    wasAutoOpenDismissedForFileId,
  } = useConversationSidePanelContext();
  const isMobile = useIsMobile();
  const clientType = useClientType();
  const isPanelOverlay = isMobile || clientType === "extension";

  // Last Frame fileId opened this message, and whether that open came from a
  // progress notification. Progress and generatedFiles use different revision
  // strings (`publicationId` vs `File.updatedAt`); after progress we must not
  // remount with the completed revision (blink), but a later completed open
  // with a new `updatedAt` while the panel still shows the same file must
  // refresh (republish).
  const lastOpenedFileIdRef = React.useRef<string | null>(null);
  const lastOpenedFromProgressRef = React.useRef(false);

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
      uniqBy(
        agentMessage.generatedFiles.filter((file) =>
          isFrameContentType(file.contentType)
        ),
        (file) => file.fileId ?? file.filePath
      ),
    [agentMessage.generatedFiles]
  );

  const regularGeneratedFiles = React.useMemo(
    () =>
      agentMessage.generatedFiles.filter(
        (file) => !file.hidden && !isFrameContentType(file.contentType)
      ),
    [agentMessage.generatedFiles]
  );

  // Reset interactive tracking when the message changes.
  React.useEffect(() => {
    lastOpenedFileIdRef.current = null;
    lastOpenedFromProgressRef.current = false;
  }, [agentMessage.sId]);

  // Single effect with explicit priority: interactive content (1) > file explorer (2).
  React.useEffect(() => {
    if (isPanelOverlay) {
      return;
    }

    // Priority 1: interactive content drawer (covers streaming and completed states).
    if (interactiveFilesFromProgress.length > 0) {
      const [firstFile] = interactiveFilesFromProgress;
      if (firstFile?.fileId) {
        // Soft notifications refresh an open Frame panel but must not steal
        // focus from another panel such as the file explorer. Explicit create /
        // edit omit autoOpen and always open.
        if (
          firstFile.autoOpen === false &&
          currentPanel != null &&
          currentPanel !== "interactive_content"
        ) {
          return;
        }
        // User closed this Frame earlier in the session — do not reopen it, even
        // for a republish. Still refresh if the panel is already showing it.
        const panelShowingThisFile =
          currentPanel === "interactive_content" &&
          !!panelData &&
          (panelData === firstFile.fileId ||
            panelData.startsWith(`${firstFile.fileId}@`));
        if (
          wasAutoOpenDismissedForFileId(firstFile.fileId) &&
          !panelShowingThisFile
        ) {
          return;
        }
        lastOpenedFileIdRef.current = firstFile.fileId;
        lastOpenedFromProgressRef.current = true;
        openPanel({
          type: "interactive_content",
          fileId: firstFile.fileId,
          timestamp: firstFile.updatedAt,
        });
      }
      return;
    }

    if (completedInteractiveFiles.length > 0 && isLastMessage) {
      const [firstFile] = completedInteractiveFiles;
      if (!firstFile?.fileId) {
        return;
      }

      const revision =
        firstFile.updatedAt !== undefined
          ? String(firstFile.updatedAt)
          : undefined;
      const nextHash = revision
        ? `${firstFile.fileId}@${revision}`
        : firstFile.fileId;
      const panelShowingThisFile =
        currentPanel === "interactive_content" &&
        !!panelData &&
        (panelData === firstFile.fileId ||
          panelData.startsWith(`${firstFile.fileId}@`));

      if (panelShowingThisFile && panelData === nextHash) {
        lastOpenedFileIdRef.current = firstFile.fileId;
        return;
      }

      if (lastOpenedFileIdRef.current === firstFile.fileId) {
        // Keep the progress hash; do not remount with File.updatedAt.
        if (lastOpenedFromProgressRef.current && panelShowingThisFile) {
          return;
        }
        // Republish while open: same file, newer completed revision.
        if (panelShowingThisFile && revision && panelData !== nextHash) {
          lastOpenedFromProgressRef.current = false;
          openPanel({
            type: "interactive_content",
            fileId: firstFile.fileId,
            timestamp: revision,
          });
          return;
        }
        // Opened earlier this message; user navigated away — don't force reopen.
        return;
      }

      if (
        wasAutoOpenDismissedForFileId(firstFile.fileId) &&
        !panelShowingThisFile
      ) {
        return;
      }

      lastOpenedFileIdRef.current = firstFile.fileId;
      lastOpenedFromProgressRef.current = false;
      openPanel({
        type: "interactive_content",
        fileId: firstFile.fileId,
        ...(revision ? { timestamp: revision } : {}),
      });
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
    regularGeneratedFiles,
    isLastMessage,
    agentMessage.sId,
    openPanel,
    currentPanel,
    panelData,
    isPanelOverlay,
    wasAutoOpenDismissedForFileId,
  ]);
}
