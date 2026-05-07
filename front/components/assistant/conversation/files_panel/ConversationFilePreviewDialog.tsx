import {
  FilePreviewDialog,
  needsFilePreviewTextContent,
} from "@app/components/files/FilePreviewDialog";
import { useConversationFileContent } from "@app/hooks/conversations/useConversationFileContent";
import config from "@app/lib/api/config";
import { parseScopedFilePath } from "@app/lib/api/files/mount_path";
import type { GCSMountFileEntry } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import type { LightWorkspaceType } from "@app/types/user";

function getConversationFileUrl(
  owner: LightWorkspaceType,
  {
    conversationId,
    filePath,
  }: {
    conversationId: string;
    filePath: string;
  }
): string {
  // TODO(20260504 FILE SYSTEM): Align endpoint so it accepts the scoped version.
  // entry.path is scoped (e.g. "conversation/notes.txt") but [...rel].ts
  // expects the path relative to the conversation's /files/ base, so strip the scope prefix.
  // Use an absolute URL so iframe/audio src attributes resolve against the API origin, not the
  // browser's current origin.
  const scoped = parseScopedFilePath(filePath);
  const rel = scoped ? scoped.rel : filePath;

  return `${config.getClientFacingUrl()}/api/w/${owner.sId}/assistant/conversations/${conversationId}/files/${rel}`;
}

interface ConversationFilePreviewDialogProps {
  conversationId: string;
  entry: GCSMountFileEntry | null;
  isOpen: boolean;
  onDownload: (entry: GCSMountFileEntry) => void;
  onNext?: () => void;
  onOpenChange: (open: boolean) => void;
  onPrev?: () => void;
  owner: LightWorkspaceType;
}

export function ConversationFilePreviewDialog({
  conversationId,
  entry,
  isOpen,
  onDownload,
  onNext,
  onOpenChange,
  onPrev,
  owner,
}: ConversationFilePreviewDialogProps) {
  const needsTextContent = entry
    ? needsFilePreviewTextContent(entry.contentType)
    : false;

  const { fileContent, isFileContentLoading, fileContentError } =
    useConversationFileContent({
      owner,
      conversationId,
      filePath: entry?.path ?? null,
      disabled: !isOpen || !entry || !needsTextContent,
    });

  const file = entry
    ? {
        content: fileContent,
        contentError: fileContentError,
        contentType: entry.contentType,
        fileName: entry.fileName,
        isContentLoading: isFileContentLoading,
        thumbnailUrl: entry.thumbnailUrl,
        viewUrl: getConversationFileUrl(owner, {
          conversationId,
          filePath: entry.path,
        }),
      }
    : null;

  return (
    <FilePreviewDialog
      file={file}
      isOpen={isOpen}
      onDownload={() => {
        if (entry) {
          onDownload(entry);
        }
      }}
      onNext={onNext}
      onOpenChange={onOpenChange}
      onPrev={onPrev}
    />
  );
}
