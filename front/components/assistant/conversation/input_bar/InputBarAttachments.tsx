// Okay to use public API types because it's front/connectors communication.

import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import type {
  Attachment,
  FileAttachment,
} from "@app/components/assistant/conversation/attachment/types";
import { attachmentToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
import {
  getDisplayDateFromPastedFileId,
  getDisplayNameFromPastedFileId,
  isPastedFile,
} from "@app/components/assistant/conversation/input_bar/pasted_utils";
import type {
  FileBlob,
  FileUploaderService,
} from "@app/hooks/useFileUploaderService";
import { isSupportedImageContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { CitationGrid, cn } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";

interface FileAttachmentsProps {
  service: FileUploaderService;
}

interface InputBarAttachmentsProps {
  owner: LightWorkspaceType;
  files: FileAttachmentsProps;
  disable?: boolean;
}

const ATTACHMENTS_ROW_CLASS_NAME = "border-b border-separator px-3 pb-3 pt-3";

function getAttachmentIconSize(hasImageAttachment: boolean) {
  return hasImageAttachment ? "md" : "sm";
}

// An image is previewable once uploaded (preview URL and file id), and counts
// as one while uploading so the row does not switch layout mid-upload.
function isImageAttachment(attachment: FileAttachment): boolean {
  return (
    isSupportedImageContentType(attachment.contentType) &&
    (attachment.isUploading ||
      (!!attachment.sourceUrl && attachment.fileId !== null))
  );
}

export function InputBarAttachments({
  owner,
  files,
  disable = false,
}: InputBarAttachmentsProps) {
  const fileService = files.service;

  const createFileAttachment = useCallback(
    (blob: FileBlob): FileAttachment => {
      const isPasted = isPastedFile(blob.contentType);
      const title = isPasted
        ? getDisplayNameFromPastedFileId(blob.id)
        : blob.filename;
      const uploadDate = isPasted
        ? getDisplayDateFromPastedFileId(blob.id)
        : undefined;

      return {
        type: "file",
        id: blob.id,
        title,
        sourceUrl: blob.sourceUrl,
        contentType: blob.contentType,
        isUploading: blob.isUploading,
        uploadProgress: blob.uploadProgress,
        size: blob.size,
        description: uploadDate,
        iconName: blob.iconName,
        provider: blob.provider,
        fileId: blob.fileId,
        onRemove: disable ? undefined : () => fileService.removeFile(blob.id),
      };
    },
    [disable, fileService]
  );

  // Convert file blobs to FileAttachments (open in viewer dialog).
  const fileAttachments: FileAttachment[] = useMemo(() => {
    return fileService.fileBlobs.map((blob) => createFileAttachment(blob));
  }, [fileService, createFileAttachment]);

  // Image previews need a tall row anyway, so every attachment keeps its
  // card next to them. Without images, attachments collapse into chips.
  const hasImageAttachment = fileAttachments.some(isImageAttachment);

  const allAttachments: Attachment[] = fileAttachments;

  if (allAttachments.length === 0) {
    return null;
  }

  const iconSize = getAttachmentIconSize(hasImageAttachment);
  const citations = allAttachments.map((attachment) => (
    <AttachmentCitation
      key={attachment.id}
      attachmentCitation={attachmentToAttachmentCitation(attachment, {
        iconSize,
      })}
      variant={hasImageAttachment ? "card" : "chip"}
    />
  ));

  return hasImageAttachment ? (
    <CitationGrid className={ATTACHMENTS_ROW_CLASS_NAME}>
      {citations}
    </CitationGrid>
  ) : (
    <div className={cn("flex flex-wrap gap-2", ATTACHMENTS_ROW_CLASS_NAME)}>
      {citations}
    </div>
  );
}
