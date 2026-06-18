import { FilePreviewDialog } from "@app/components/file_explorer/FilePreviewDialog";
import type { FileEntry } from "@app/components/file_explorer/types";
import {
  getFileDownloadUrl,
  getFilePathDownloadUrl,
  getFilePathViewUrl,
  getFileViewUrl,
} from "@app/lib/swr/files";
import type { LightWorkspaceType } from "@app/types/user";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface PreviewableFile {
  fileId?: string | null;
  filePath?: string;
  title: string;
  contentType: string;
}

type FilePreviewContextType = {
  openFilePreview: (file: PreviewableFile) => void;
};

const FilePreviewContext = createContext<FilePreviewContextType>({
  openFilePreview: () => {},
});

interface FilePreviewProviderProps {
  owner: LightWorkspaceType;
  children: ReactNode;
}

export function FilePreviewProvider({
  owner,
  children,
}: FilePreviewProviderProps) {
  const [previewState, setPreviewState] = useState<{
    entry: FileEntry;
    fileUrl: string;
    downloadUrl: string;
  } | null>(null);

  const openFilePreview = useCallback(
    (file: PreviewableFile) => {
      const fileUrl = file.filePath
        ? getFilePathViewUrl(owner, file.filePath)
        : file.fileId
          ? getFileViewUrl(owner, file.fileId)
          : null;

      const downloadUrl = file.filePath
        ? getFilePathDownloadUrl(owner, file.filePath)
        : file.fileId
          ? getFileDownloadUrl(owner, file.fileId)
          : null;

      if (!fileUrl || !downloadUrl) {
        return;
      }

      setPreviewState({
        entry: {
          kind: "file",
          isDirectory: false,
          fileName: file.title,
          path: file.title,
          contentType: file.contentType,
          fileId: file.fileId ?? null,
          thumbnailUrl: null,
          sizeBytes: 0,
          lastModifiedMs: 0,
        },
        fileUrl,
        downloadUrl,
      });
    },
    [owner]
  );

  const handleDownload = useCallback(async () => {
    if (previewState?.downloadUrl) {
      window.open(previewState.downloadUrl, "_blank");
    }
  }, [previewState?.downloadUrl]);

  const contextValue = useMemo(() => ({ openFilePreview }), [openFilePreview]);

  return (
    <FilePreviewContext.Provider value={contextValue}>
      {children}
      <FilePreviewDialog
        entry={previewState?.entry ?? null}
        fileUrl={previewState?.fileUrl ?? null}
        isOpen={!!previewState}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewState(null);
          }
        }}
        onDownload={handleDownload}
      />
    </FilePreviewContext.Provider>
  );
}

export function useFilePreviewContext() {
  return useContext(FilePreviewContext);
}
