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

export interface PreviewableFile {
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

export function downloadPreviewableFile(
  owner: LightWorkspaceType,
  file: PreviewableFile
) {
  const downloadUrl = file.filePath
    ? getFilePathDownloadUrl(owner, file.filePath)
    : file.fileId
      ? getFileDownloadUrl(owner, file.fileId)
      : null;

  if (downloadUrl) {
    window.open(downloadUrl, "_blank");
  }
}

/** The file id of a Frame to open, from its path when needed; null after notifying the user. */
export function useResolveFrameFileId(owner: LightWorkspaceType) {
  const { t } = useLingui();
  const sendNotification = useSendNotification();

  return useCallback(
    async ({
      fileId,
      filePath,
    }: Omit<PreviewableFile, "contentType">): Promise<string | null> => {
      const resolvedFileId =
        fileId ??
        (filePath ? await fetchFileIdFromPath({ owner, filePath }) : null);
      if (!resolvedFileId) {
        sendNotification({
          type: "error",
          title: t`Failed to open Frame`,
          description: t`No linked file was found for this Frame.`,
        });
      }
      return resolvedFileId;
    },
    [owner, sendNotification, t]
  );
}

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
/**
 * @cc [owner:tdraier,label:product;react] file-preview-without-conversation
 * Without a conversation side panel, the provider MUST pass on the enclosing file preview
 * provider's handlers when there is one, so a page's own handlers (`FilePreviewHandlersProvider`)
 * reach every file reference under it.
 */
export function FilePreviewProvider({
  owner,
  keepCurrentPanel = false,
  children,
}: FilePreviewProviderProps) {
  const { hasConversation, openPanel } = useConversationSidePanelContext();
  const enclosing = useContext(FilePreviewContext);
  const resolveFrameFileId = useResolveFrameFileId(owner);

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

      downloadPreviewableFile(owner, file);
    },
    [hasConversation, keepCurrentPanel, openPanel, owner]
  );

  const openFramePreview = useCallback(
    async ({ fileId, filePath }: Omit<PreviewableFile, "contentType">) => {
      const resolvedFileId = await resolveFrameFileId({ fileId, filePath });
      if (resolvedFileId) {
        openPanel(
          { type: "interactive_content", fileId: resolvedFileId },
          { keepCurrent: keepCurrentPanel }
        );
      }
    },
    [keepCurrentPanel, openPanel, resolveFrameFileId]
  );

  const sidePanelValue = useMemo(
    () => ({ canPreview: hasConversation, openFilePreview, openFramePreview }),
    [hasConversation, openFilePreview, openFramePreview]
  );

  return (
    <FilePreviewContext.Provider
      value={!hasConversation && enclosing ? enclosing : sidePanelValue}
    >
      {children}
    </FilePreviewContext.Provider>
  );
}

interface FilePreviewHandlersProviderProps {
  openFilePreview: FilePreviewContextType["openFilePreview"];
  openFramePreview: FilePreviewContextType["openFramePreview"];
  children: ReactNode;
}

/** Opens previewable files with a page's own handlers, for pages without a conversation side panel. */
export function FilePreviewHandlersProvider({
  openFilePreview,
  openFramePreview,
  children,
}: FilePreviewHandlersProviderProps) {
  const value = useMemo(
    () => ({ canPreview: true, openFilePreview, openFramePreview }),
    [openFilePreview, openFramePreview]
  );

  return (
    <FilePreviewContext.Provider value={value}>
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
