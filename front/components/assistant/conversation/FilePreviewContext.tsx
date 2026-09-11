import { ConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { isFilePreviewableContentType } from "@app/components/file_explorer/utils";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  fetchFileIdFromPath,
  getFileDownloadUrl,
  getFilePathDownloadUrl,
} from "@app/lib/swr/files";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

interface PreviewableFile {
  fileId?: string | null;
  filePath?: string;
  title: string;
  contentType: string;
}

interface FrameFile {
  fileId?: string | null;
  filePath?: string;
}

type FilePreviewContextType = {
  canPreview: boolean;
  openFilePreview: (file: PreviewableFile) => void;
  openFramePreview: (frame: FrameFile) => Promise<void>;
};

const FilePreviewContext = createContext<FilePreviewContextType>({
  canPreview: false,
  openFilePreview: () => {},
  openFramePreview: () => Promise.resolve(),
});

interface FilePreviewProviderProps {
  owner: LightWorkspaceType;
  children: ReactNode;
}

export function FilePreviewProvider({
  owner,
  children,
}: FilePreviewProviderProps) {
  const sidePanel = useContext(ConversationSidePanelContext);
  const sendNotification = useSendNotification();
  const canPreview = sidePanel?.hasConversation ?? false;

  // The side panel context value changes on every panel navigation. Reading it
  // through a ref keeps the callbacks below stable, so citations do not all
  // re-render each time the panel switches.
  const sidePanelRef = useRef(sidePanel);
  useEffect(() => {
    sidePanelRef.current = sidePanel;
  });

  const openFilePreview = useCallback(
    (file: PreviewableFile) => {
      const panel = sidePanelRef.current;

      if (
        isFilePreviewableContentType(file.contentType) &&
        panel?.hasConversation
      ) {
        if (file.filePath) {
          panel.openPanel({ type: "file_preview", filePath: file.filePath });
          return;
        }
        if (file.fileId) {
          panel.openPanel({ type: "file_preview", fileId: file.fileId });
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
    [owner]
  );

  const openFramePreview = useCallback(
    async ({ fileId, filePath }: FrameFile) => {
      try {
        const resolvedFileId =
          fileId ??
          (filePath ? await fetchFileIdFromPath({ owner, filePath }) : null);

        if (!resolvedFileId) {
          throw new Error("No linked file was found for this Frame.");
        }

        sidePanelRef.current?.openPanel({
          type: "interactive_content",
          fileId: resolvedFileId,
        });
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to open Frame",
          description: normalizeError(error).message,
        });
      }
    },
    [owner, sendNotification]
  );

  const contextValue = useMemo(
    () => ({ canPreview, openFilePreview, openFramePreview }),
    [canPreview, openFilePreview, openFramePreview]
  );

  return (
    <FilePreviewContext.Provider value={contextValue}>
      {children}
    </FilePreviewContext.Provider>
  );
}

export function useFilePreviewContext() {
  return useContext(FilePreviewContext);
}
