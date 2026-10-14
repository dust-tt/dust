import type { PreviewableFile } from "@app/components/assistant/conversation/FilePreviewContext";
import {
  downloadPreviewableFile,
  FilePreviewHandlersProvider,
  useResolveFrameFileId,
} from "@app/components/assistant/conversation/FilePreviewContext";
import { FilePreviewDialog } from "@app/components/file_explorer/FilePreviewDialog";
import { useFileEntryFromPath } from "@app/components/file_explorer/useFileEntryFromPath";
import { PodFrameSheet } from "@app/components/pod/files/PodFrameSheet";
import { getFileNameFromScopedPath } from "@app/lib/markdown/file_preview";
import { getFilePathDownloadUrl, getFilePathViewUrl } from "@app/lib/swr/files";
import { isFilePreviewableContentType } from "@app/types/file_preview";
import type { PodType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

interface PodFilePathPreviewDialogProps {
  owner: WorkspaceType;
  filePath: string;
  onClose: () => void;
}

function PodFilePathPreviewDialog({
  owner,
  filePath,
  onClose,
}: PodFilePathPreviewDialogProps) {
  const { entry } = useFileEntryFromPath({ owner, filePath });

  return (
    <FilePreviewDialog
      entry={entry}
      fileUrl={getFilePathViewUrl(owner, filePath)}
      isOpen
      owner={owner}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onDownload={async () => {
        window.open(getFilePathDownloadUrl(owner, filePath), "_blank");
      }}
    />
  );
}

interface PodFilePreviewProviderProps {
  owner: WorkspaceType;
  pod: PodType;
  children: ReactNode;
}

/**
 * @cc [owner:tdraier,label:product;react] pod-file-preview
 * On a pod page, a previewable file referenced under this provider MUST open by its path in a file
 * preview dialog stacked on what is shown, and a Frame in the pod's Frame sheet, so closing either
 * returns to it; any other file MUST download.
 */
export function PodFilePreviewProvider({
  owner,
  pod,
  children,
}: PodFilePreviewProviderProps) {
  const resolveFrameFileId = useResolveFrameFileId(owner);
  const [previewedPath, setPreviewedPath] = useState<string | null>(null);
  const [framePreview, setFramePreview] = useState<{
    fileId: string;
    path: string | null;
  } | null>(null);

  const openFilePreview = useCallback(
    (file: PreviewableFile) => {
      if (file.filePath && isFilePreviewableContentType(file.contentType)) {
        setPreviewedPath(file.filePath);
        return;
      }
      downloadPreviewableFile(owner, file);
    },
    [owner]
  );

  const openFramePreview = useCallback(
    async ({ fileId, filePath }: Omit<PreviewableFile, "contentType">) => {
      const resolvedFileId = await resolveFrameFileId({ fileId, filePath });
      if (resolvedFileId) {
        setFramePreview({ fileId: resolvedFileId, path: filePath ?? null });
      }
    },
    [resolveFrameFileId]
  );

  return (
    <FilePreviewHandlersProvider
      openFilePreview={openFilePreview}
      openFramePreview={openFramePreview}
    >
      {children}
      {previewedPath && (
        <PodFilePathPreviewDialog
          key={previewedPath}
          owner={owner}
          filePath={previewedPath}
          onClose={() => setPreviewedPath(null)}
        />
      )}
      <PodFrameSheet
        owner={owner}
        fileId={framePreview?.fileId ?? null}
        framePath={framePreview?.path ?? null}
        fileName={
          framePreview?.path
            ? getFileNameFromScopedPath(framePreview.path)
            : undefined
        }
        podId={pod.sId}
        pinnedFramePath={pod.pinnedFramePath ?? null}
        fileTabs={pod.frameTabs ?? []}
        tabsOrder={pod.tabsOrder ?? []}
        isEditor={pod.isEditor}
        isMember={pod.isMember}
        isArchived={!!pod.archivedAt}
        isOpen={framePreview !== null}
        onClose={() => setFramePreview(null)}
      />
    </FilePreviewHandlersProvider>
  );
}
