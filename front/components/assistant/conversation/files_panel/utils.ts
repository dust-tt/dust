import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import type { SandboxFileEntry } from "@app/lib/api/sandbox/files";
import { assertNever } from "@app/types/shared/utils/assert_never";

import type {
  ConversationAttachmentItem,
  ConversationAttachmentRow,
  SandboxTreeNode,
} from "./types";

/**
 * Build a tree from flat GCS file entries by inferring directories from paths.
 * The GCS prefix (e.g. "w/{wId}/conversations/{cId}/files/") is stripped so
 * tree paths start at the sandbox working directory root.
 */
export function buildSandboxTree(
  entries: SandboxFileEntry[]
): SandboxTreeNode[] {
  const root: SandboxTreeNode[] = [];
  const nodeMap = new Map<string, SandboxTreeNode>();

  // Find the common prefix to strip (everything up to and including "files/").
  const commonPrefix =
    entries.length > 0
      ? entries[0].path.substring(
          0,
          entries[0].path.indexOf("/files/") + "/files/".length
        )
      : "";

  for (const entry of entries) {
    const relativePath = entry.path.startsWith(commonPrefix)
      ? entry.path.slice(commonPrefix.length)
      : entry.path;

    if (!relativePath) {
      continue;
    }

    const parts = relativePath.split("/");

    // Ensure all ancestor directories exist as nodes.
    let currentPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      if (!nodeMap.has(currentPath)) {
        const dirNode: SandboxTreeNode = {
          name: parts[i],
          path: currentPath,
          contentType: "inode/directory",
          fileId: null,
          children: [],
        };
        nodeMap.set(currentPath, dirNode);

        const parentPath = currentPath.substring(
          0,
          currentPath.lastIndexOf("/")
        );
        const parent = parentPath ? nodeMap.get(parentPath) : undefined;
        if (parent) {
          parent.children.push(dirNode);
        } else {
          root.push(dirNode);
        }
      }
    }

    // Add the file node.
    const fileNode: SandboxTreeNode = {
      name: parts[parts.length - 1],
      path: relativePath,
      contentType: entry.contentType,
      fileId: entry.fileId,
      children: [],
    };
    nodeMap.set(relativePath, fileNode);

    const parentPath = relativePath.substring(0, relativePath.lastIndexOf("/"));
    const parent = parentPath ? nodeMap.get(parentPath) : undefined;
    if (parent) {
      parent.children.push(fileNode);
    } else {
      root.push(fileNode);
    }
  }

  return root;
}

export function conversationAttachmentToRow(
  item: ConversationAttachmentItem,
  onFileClick: (item: ConversationAttachmentItem) => void
): ConversationAttachmentRow {
  if (isFileAttachmentType(item)) {
    const { title, contentType, fileId, source } = item;
    return {
      title,
      contentType,
      fileId,
      source,
      onClick: () => onFileClick(item),
    };
  } else if (isContentNodeAttachmentType(item)) {
    const { title, contentType, sourceUrl } = item;
    return {
      title,
      contentType,
      fileId: null,
      source: null,
      onClick: sourceUrl
        ? () => window.open(sourceUrl, "_blank", "noopener,noreferrer")
        : undefined,
    };
  } else {
    assertNever(item);
  }
}
