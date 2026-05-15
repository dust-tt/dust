import { getFilePreviewConfig } from "@app/components/spaces/FilePreviewSheet";

export const MIN_FILES_FOR_SEARCH = 10;

import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import type { GCSMountEntry } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import {
  frameSlideshowContentType,
  isInteractiveContentType,
} from "@app/types/files";
import { assertNever } from "@app/types/shared/utils/assert_never";

import type {
  ConversationAttachmentItem,
  ConversationAttachmentRow,
  FileExplorerBucket,
  FileExplorerSortMode,
  FilePanelCategory,
  SandboxTreeNode,
} from "./types";

/**
 * Maps a tree node (file or folder) to its explorer filter bucket. Audio files (and any other
 * unmapped type) return null and only surface under the "All" chip.
 */
export function getFileExplorerBucket(
  node: SandboxTreeNode
): FileExplorerBucket | null {
  if (node.isDirectory) {
    return "folders";
  }

  const contentType = node.contentType;
  if (!contentType) {
    return null;
  }

  if (isInteractiveContentType(contentType)) {
    return "frames";
  }

  const previewConfig = getFilePreviewConfig(contentType);
  switch (previewConfig.category) {
    case "image":
      return "images";

    case "code":
      return "code";

    case "delimited":
      return "tables";

    case "pdf":
    case "viewer":
    case "markdown":
    case "text":
      return "texts";

    case "frame":
      return "frames";

    default:
      return null;
  }
}

/**
 * Returns a node's sort key for the explorer sort modes. Falls back to 0 / empty string when
 * the underlying entry isn't available (e.g. inferred directory).
 */
export function compareTreeNodesForSort(
  a: SandboxTreeNode,
  b: SandboxTreeNode,
  sortMode: FileExplorerSortMode,
  timestampsByPath: Map<string, number>
): number {
  switch (sortMode) {
    case "name-asc":
      return a.name.localeCompare(b.name);

    case "name-desc":
      return b.name.localeCompare(a.name);

    case "last-modified":
    case "last-created": {
      // Folders have no timestamp on the tree (they're inferred from file paths). Fall through
      // to alphabetical so they group at the top in a stable order.
      const ta = timestampsByPath.get(a.path) ?? 0;
      const tb = timestampsByPath.get(b.path) ?? 0;
      if (tb !== ta) {
        return tb - ta;
      }

      return a.name.localeCompare(b.name);
    }

    default:
      return 0;
  }
}

/**
 * Category display configuration, ordered by priority.
 */
export const CATEGORY_CONFIG: {
  value: FilePanelCategory;
  singular: string;
  plural: string;
}[] = [
  { value: "frame", singular: "Frame", plural: "Frames" },
  { value: "slideshow", singular: "Slideshow", plural: "Slideshows" },
  { value: "image", singular: "Image", plural: "Images" },
  { value: "document", singular: "Document", plural: "Documents" },
  { value: "pdf", singular: "PDF", plural: "PDFs" },
  { value: "table", singular: "Table", plural: "Tables" },
  { value: "audio", singular: "Audio", plural: "Audio" },
  { value: "knowledge", singular: "Knowledge", plural: "Knowledge" },
  { value: "other", singular: "File", plural: "Other" },
];

/**
 * Human-readable singular category for a file MIME type (Image, Frame, PDF, …).
 * Aligns with {@link getFilePanelCategory} / {@link getCategoryFromContentType}.
 */
export function getSingularFileCategoryLabelForContentType(
  contentType: string
): string {
  const category: FilePanelCategory = isInteractiveContentType(contentType)
    ? contentType === frameSlideshowContentType
      ? "slideshow"
      : "frame"
    : getCategoryFromContentType(contentType);
  const config = CATEGORY_CONFIG.find((c) => c.value === category);
  return config?.singular ?? "File";
}

/**
 * Categorize a file by its content type alone (used for sandbox/mounted files).
 */
export function getCategoryFromContentType(
  contentType: string
): FilePanelCategory {
  const previewConfig = getFilePreviewConfig(contentType);

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
 * Build a tree from flat file entries by inferring directories from paths.
 * entry.path is a scoped path (e.g. "conversation/subdir/file.png"); the
 * use-case prefix (first segment) is stripped so tree paths start at the
 * sandbox working directory root.
 */
export function buildSandboxTree(entries: GCSMountEntry[]): SandboxTreeNode[] {
  const root: SandboxTreeNode[] = [];
  const nodeMap = new Map<string, SandboxTreeNode>();

  for (const entry of entries.filter((e) => !e.isDirectory)) {
    const slashIdx = entry.path.indexOf("/");
    const relativePath =
      slashIdx >= 0 ? entry.path.slice(slashIdx + 1) : entry.path;

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
          isDirectory: true,
          contentType: null,
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
      isDirectory: false,
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
