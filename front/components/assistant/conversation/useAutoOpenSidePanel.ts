import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { AgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { useConversationMessageAction } from "@app/hooks/conversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { isInteractiveContentFileContentOutput } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  CONVERSATION_SIDE_PANEL_SERVER_NAME,
  SET_FILES_SIDE_PANEL_TOOL_NAME,
} from "@app/lib/api/actions/servers/conversation_side_panel/metadata";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import { FILES_SIDE_PANEL_TYPE } from "@app/types/conversation_side_panel";
import { isFrameContentType } from "@app/types/files";
import { removeNulls } from "@app/types/shared/utils/general";
import React from "react";

interface UseAutoOpenSidePanelProps {
  isLastMessage: boolean;
  agentMessage: AgentMessageWithStreaming;
}

function isSetFilesSidePanelAction(
  action: Pick<AgentMCPActionWithOutputType, "internalMCPServerName"> & {
    toolName: string | null;
  }
): boolean {
  return (
    action.internalMCPServerName === CONVERSATION_SIDE_PANEL_SERVER_NAME &&
    action.toolName === SET_FILES_SIDE_PANEL_TOOL_NAME
  );
}

function getFilesSidePanelVisibility(
  actions: readonly AgentMCPActionWithOutputType[]
): boolean | undefined {
  let latestAction: AgentMCPActionWithOutputType | undefined;

  for (const action of actions) {
    if (
      isSetFilesSidePanelAction(action) &&
      action.status === "succeeded" &&
      typeof action.params.visible === "boolean" &&
      (!latestAction || action.updatedAt > latestAction.updatedAt)
    ) {
      latestAction = action;
    }
  }

  return typeof latestAction?.params.visible === "boolean"
    ? latestAction.params.visible
    : undefined;
}

function getLatestFilesSidePanelActionId(
  agentMessage: AgentMessageWithStreaming
): string | null {
  let actionId: string | null = null;

  for (const step of agentMessage.activitySteps) {
    if (step.type === "action" && isSetFilesSidePanelAction(step)) {
      actionId = step.actionId;
    }
  }

  return actionId;
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
  const { openPanel, closePanel, currentPanel } =
    useConversationSidePanelContext();
  const { workspace } = useAuth();
  const conversationId = useActiveConversationId();
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
        isFrameContentType(file.contentType)
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

  const filesSidePanelVisibilityFromActions = getFilesSidePanelVisibility(
    agentMessage.actions
  );
  const filesSidePanelActionId = getLatestFilesSidePanelActionId(agentMessage);
  const { action: filesSidePanelAction } = useConversationMessageAction({
    conversationId: conversationId ?? "",
    workspaceId: workspace.sId,
    messageId: agentMessage.sId,
    actionId: conversationId ? filesSidePanelActionId : null,
  });
  const filesSidePanelVisibility =
    filesSidePanelVisibilityFromActions ??
    getFilesSidePanelVisibility(
      filesSidePanelAction ? [filesSidePanelAction] : []
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
      const [firstFile] = interactiveFilesFromProgress;
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
      const [firstFile] = completedInteractiveFiles;
      if (
        firstFile?.fileId &&
        lastOpenedFileIdRef.current !== firstFile.fileId
      ) {
        lastOpenedFileIdRef.current = firstFile.fileId;
        openPanel({ type: "interactive_content", fileId: firstFile.fileId });
      }
      return;
    }

    if (isLastMessage && filesSidePanelVisibility === false) {
      if (currentPanel === FILES_SIDE_PANEL_TYPE) {
        closePanel();
      }
      return;
    }

    if (isLastMessage && filesSidePanelVisibility === true) {
      openPanel({ type: FILES_SIDE_PANEL_TYPE });
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
    filesSidePanelVisibility,
    isLastMessage,
    agentMessage.sId,
    openPanel,
    closePanel,
    currentPanel,
    isMobile,
  ]);

  return { interactiveFiles: completedInteractiveFiles };
}
