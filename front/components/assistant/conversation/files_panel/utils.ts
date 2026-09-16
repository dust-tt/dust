import type { FilePanelCategory } from "@app/components/file_explorer/types";
import { getCategoryFromContentType } from "@app/components/file_explorer/utils";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import {
  frameSlideshowContentType,
  isFrameContentType,
} from "@app/types/files";
import { resolveCanonicalScopedPath } from "@app/types/mount_path";
import { assertNever } from "@app/types/shared/utils/assert_never";

import type {
  ConversationAttachmentItem,
  ConversationAttachmentRow,
} from "./types";

function getFilePanelCategory(
  item: ConversationAttachmentItem
): FilePanelCategory {
  if (isContentNodeAttachmentType(item)) {
    return "knowledge";
  }

  if (isFrameContentType(item.contentType)) {
    return item.contentType === frameSlideshowContentType
      ? "slideshow"
      : "frame";
  }

  return getCategoryFromContentType(item.contentType);
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

/**
 * Agents write legacy scoped paths (`conversation/report.xlsx`) while the files
 * panel carries canonical ones (`conversation-{cId}/report.xlsx`). The files API
 * only accepts the canonical form, so resolve both to it.
 */
export function resolveFilePreviewPath({
  conversation,
  filePath,
}: {
  conversation: Pick<ConversationWithoutContentType, "sId" | "spaceId">;
  filePath: string | undefined;
}): string | null {
  if (!filePath) {
    return null;
  }

  return resolveCanonicalScopedPath(filePath, {
    conversationId: conversation.sId,
    spaceId: conversation.spaceId,
  });
}
