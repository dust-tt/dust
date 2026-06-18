import type { FilePanelCategory } from "@app/components/file_explorer/types";
import { getFilePreviewConfig } from "@app/components/file_explorer/utils";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import {
  frameSlideshowContentType,
  isInteractiveContentType,
} from "@app/types/files";
import { assertNever } from "@app/types/shared/utils/assert_never";

import type {
  ConversationAttachmentItem,
  ConversationAttachmentRow,
} from "./types";

export function getFilePanelCategory(
  item: ConversationAttachmentItem
): FilePanelCategory {
  if (isContentNodeAttachmentType(item)) {
    return "knowledge";
  }

  if (isInteractiveContentType(item.contentType)) {
    return item.contentType === frameSlideshowContentType
      ? "slideshow"
      : "frame";
  }

  const previewConfig = getFilePreviewConfig(item.contentType);

  switch (previewConfig.category) {
    case "pdf":
      return "pdf";
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "delimited":
      return "table";
    case "code":
    case "viewer":
    case "markdown":
    case "text":
      return "document";
    case "frame":
      return "frame";
    default:
      return "other";
  }
}

export function conversationAttachmentToRow(
  item: ConversationAttachmentItem,
  onFileClick: (item: ConversationAttachmentItem) => void
): ConversationAttachmentRow {
  const category = getFilePanelCategory(item);

  if (isFileAttachmentType(item)) {
    const { title, contentType, fileId, source, isInProjectContext, creator } =
      item;
    return {
      title,
      contentType,
      fileId,
      source,
      category,
      isInProjectContext,
      creator,
      date: item.updatedAt ?? item.createdAt ?? null,
      onClick: () => onFileClick(item),
    };
  } else if (isContentNodeAttachmentType(item)) {
    const { title, contentType, sourceUrl, isInProjectContext, creator } = item;
    return {
      title,
      contentType,
      fileId: null,
      source: null,
      category,
      isInProjectContext,
      creator,
      date: null,
      onClick: sourceUrl
        ? () => window.open(sourceUrl, "_blank", "noopener,noreferrer")
        : undefined,
    };
  } else {
    assertNever(item);
  }
}
