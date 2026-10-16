import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  fetchFileIdFromPath,
  getFileDownloadUrl,
  getFilePathDownloadUrl,
} from "@app/lib/swr/files";
import { isFilePreviewableContentType } from "@app/types/file_preview";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";

interface PreviewableFile {
  fileId?: string | null;
  filePath?: string;
  contentType: string;
}

type FilePreviewContextType = {
  canPreview: boolean;
  openFilePreview: (file: PreviewableFile) => void;
  openFramePreview: (
    frame: Omit<PreviewableFile, "contentType">
  ) => Promise<void>;
};

const FilePreviewContext = createContext<FilePreviewContextType | null>(null);

interface FilePreviewProviderProps {
  owner: LightWorkspaceType;
  keepCurrentPanel?: boolean;
  children: ReactNode;
}

/**
 * @cc [owner:tdraier,label:product;react] file-preview-keep-current-panel
 * With `keepCurrentPanel`, a file or Frame opened in the side panel MUST keep the shown panel in
 * its history (`side-panel-keep-current`), so closing it returns to that panel.
 */
export function FilePreviewProvider({
  owner,
  keepCurrentPanel = false,
  children,
}: FilePreviewProviderProps) {
  const { t } = useLingui();
  const { hasConversation, openPanel } = useConversationSidePanelContext();
  const sendNotification = useSendNotification();

  const openFilePreview = useCallback(
    (file: PreviewableFile) => {
      if (isFilePreviewableContentType(file.contentType) && hasConversation) {
        if (file.filePath) {
          openPanel(
            { type: "file_preview", kind: "path", filePath: file.filePath },
            { keepCurrent: keepCurrentPanel }
          );
          return;
        }
        if (file.fileId) {
          openPanel(
            { type: "file_preview", kind: "id", fileId: file.fileId },
            { keepCurrent: keepCurrentPanel }
          );
          return;
        }
      }

      const downloadUrl = file.filePath
        ? getFilePathDownloadUrl(owner, file.filePath)
        : file.fileId
          ? getFileDownloadUrl(owner, file.fileId)
          : null;

      if (downloadUrl) {
        window.open(downloadUrl, "_blank");
      }
    },
    [hasConversation, keepCurrentPanel, openPanel, owner]
  );

  const openFramePreview = useCallback(
    async ({ fileId, filePath }: Omit<PreviewableFile, "contentType">) => {
      const resolvedFileId =
        fileId ??
        (filePath ? await fetchFileIdFromPath({ owner, filePath }) : null);

      if (!resolvedFileId) {
        sendNotification({
          type: "error",
          title: t`Failed to open Frame`,
          description: t`No linked file was found for this Frame.`,
        });
        return;
      }

      openPanel(
        {
          type: "interactive_content",
          fileId: resolvedFileId,
          openedFrom: { source: "user", uiElement: "file_citation" },
        },
        { keepCurrent: keepCurrentPanel }
      );
    },
    [keepCurrentPanel, openPanel, owner, sendNotification, t]
  );

  const contextValue = useMemo(
    () => ({ canPreview: hasConversation, openFilePreview, openFramePreview }),
    [hasConversation, openFilePreview, openFramePreview]
  );

  return (
    <FilePreviewContext.Provider value={contextValue}>
      {children}
    </FilePreviewContext.Provider>
  );
}

export function useFilePreviewContext() {
  const context = useContext(FilePreviewContext);
  if (!context) {
    throw new Error(
      "useFilePreviewContext must be used within a FilePreviewProvider"
    );
  }
  return context;
}
