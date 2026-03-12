import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import type { SandboxFileEntry } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/sandbox/files";
import { assertNever } from "@app/types/shared/utils/assert_never";

import type {
  ConversationAttachmentItem,
  ConversationAttachmentRow,
  SandboxTreeNode,
} from "./types";

export function buildSandboxTree(
  entries: SandboxFileEntry[]
): SandboxTreeNode[] {
  const root: SandboxTreeNode[] = [];

  // Sort entries so directories come before files at the same level.
  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.path.localeCompare(b.path);
  });

  // Build a map of path -> node for quick parent lookup.
  const nodeMap = new Map<string, SandboxTreeNode>();

  for (const entry of sorted) {
    const node: SandboxTreeNode = {
      name: entry.fileName,
      path: entry.path,
      isDirectory: entry.isDirectory,
      contentType: entry.contentType,
      fileId: entry.fileId,
      children: [],
    };
    nodeMap.set(entry.path, node);

    // Find parent directory path.
    const parentPath = entry.path.substring(0, entry.path.lastIndexOf("/"));
    const parent = nodeMap.get(parentPath);
    if (parent) {
      parent.children.push(node);
    } else {
      root.push(node);
    }
  }

  return root;
}

export function conversationAttachmentToRow(
  item: ConversationAttachmentItem,
  onFileClick: (fileId: string, title: string, contentType: string) => void
): ConversationAttachmentRow {
  if (isFileAttachmentType(item)) {
    return {
      title: item.title,
      contentType: item.contentType,
      fileId: item.fileId,
      source: item.source,
      onClick: () => {
        onFileClick(item.fileId, item.title, item.contentType);
      },
    };
  } else if (isContentNodeAttachmentType(item)) {
    return {
      title: item.title,
      contentType: item.contentType,
      fileId: null,
      source: null,
      onClick: item.sourceUrl
        ? () => window.open(item.sourceUrl!, "_blank", "noopener,noreferrer")
        : undefined,
    };
  } else {
    assertNever(item);
  }
}
