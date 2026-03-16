import { getFilePreviewConfig } from "@app/components/spaces/FilePreviewSheet";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import type { SandboxFileEntry } from "@app/lib/api/sandbox/files";
import {
  frameSlideshowContentType,
  isInteractiveContentType,
} from "@app/types/files";
import { assertNever } from "@app/types/shared/utils/assert_never";

import type {
  ConversationAttachmentItem,
  ConversationAttachmentRow,
  FilePanelCategory,
  SandboxTreeNode,
} from "./types";

/**
 * Category display configuration, ordered by priority.
 */
export const CATEGORY_CONFIG: {
  value: FilePanelCategory;
  label: string;
}[] = [
  { value: "frame", label: "Frames" },
  { value: "slideshow", label: "Slideshows" },
  { value: "image", label: "Images" },
  { value: "document", label: "Documents" },
  { value: "pdf", label: "PDFs" },
  { value: "table", label: "Tables" },
  { value: "audio", label: "Audio" },
  { value: "knowledge", label: "Knowledge" },
  { value: "other", label: "Other" },
];

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
