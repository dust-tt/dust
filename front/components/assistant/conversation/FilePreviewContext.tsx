import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { isFilePreviewableContentType } from "@app/components/file_explorer/utils";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  fetchFileIdFromPath,
  getFileDownloadUrl,
  getFilePathDownloadUrl,
} from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types/user";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";

interface PreviewableFile {
  fileId?: string | null;
  filePath?: string;
  contentType: string;
}

type FilePreviewContextType = {
  openFilePreview: (file: PreviewableFile) => void;
  openFramePreview: (
    frame: Omit<PreviewableFile, "contentType">
  ) => Promise<void>;
};

const FilePreviewContext = createContext<FilePreviewContextType | null>(null);

interface FilePreviewProviderProps {
  owner: LightWorkspaceType;
  children: ReactNode;
}

export function FilePreviewProvider({
  owner,
  children,
}: FilePreviewProviderProps) {
  const { openPanel } = useConversationSidePanelContext();
  const sendNotification = useSendNotification();

  const openFilePreview = useCallback(
    (file: PreviewableFile) => {
      if (isFilePreviewableContentType(file.contentType)) {
        if (file.filePath) {
          openPanel({
            type: "file_preview",
            kind: "path",
            filePath: file.filePath,
          });
          return;
        }
        if (file.fileId) {
          openPanel({ type: "file_preview", kind: "id", fileId: file.fileId });
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
    [openPanel, owner]
  );

  const openFramePreview = useCallback(
    async ({ fileId, filePath }: Omit<PreviewableFile, "contentType">) => {
      const resolvedFileId =
        fileId ??
        (filePath ? await fetchFileIdFromPath({ owner, filePath }) : null);

      if (!resolvedFileId) {
        sendNotification({
          type: "error",
          title: "Failed to open Frame",
          description: "No linked file was found for this Frame.",
        });
        return;
      }

      openPanel({ type: "interactive_content", fileId: resolvedFileId });
    },
    [openPanel, owner, sendNotification]
  );

  const contextValue = useMemo(
    () => ({ openFilePreview, openFramePreview }),
    [openFilePreview, openFramePreview]
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
