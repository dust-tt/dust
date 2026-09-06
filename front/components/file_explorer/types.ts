import type {
  FileSystemEntry,
  FileSystemFileEntry,
} from "@app/types/api/file_system/types";
import type { ConnectorProvider } from "@app/types/data_source";
import type { frameV2ContentType } from "@app/types/files";
import type React from "react";

/** Explorer input: canonical `path` plus an optional UI-only navigation path. */
export type FileExplorerPathEntry = FileSystemEntry & {
  virtualPath?: string;
};

export type FileEntry = FileSystemFileEntry & {
  kind: "file";
  /** UI navigation path when entries from multiple scopes are merged. */
  virtualPath?: string;
};
export type FileEntryWithId = FileEntry & { fileId: string };

export type FramePackageEntry = Omit<
  FileEntryWithId,
  "contentType" | "fileName" | "kind"
> & {
  kind: "frame_package";
  contentType: typeof frameV2ContentType;
  /** Display name of the source folder represented by this package. */
  fileName: string;
  /** Explorer navigation path of the package's source folder. */
  sourceFolderPath: string;
  /** Canonical filesystem path of the package's source folder. */
  sourceFolderCanonicalPath: string;
};

export type ContentNodeEntry = {
  kind: "node";
  fileName: string;
  path: string;
  lastModifiedMs: number | null;
  sourceUrl: string | null;
  nodeId: string;
  nodeDataSourceViewId: string;
  connectorProvider: ConnectorProvider | null;
};

export type FolderEntry = {
  kind: "folder";
  path: string;
  name: string;
};

export type FolderDownloadEntry = FolderEntry | FramePackageEntry;

export type FileExplorerEntry =
  | FileEntry
  | FramePackageEntry
  | ContentNodeEntry
  | FolderEntry;

export type FileExplorerMenuAction = {
  label: string;
  icon: React.ComponentType;
  variant?: "warning";
  onClick: (e: React.MouseEvent) => void;
};

export type FilePanelCategory =
  | "frame"
  | "slideshow"
  | "document"
  | "pdf"
  | "table"
  | "image"
  | "audio"
  | "knowledge"
  | "other";

type FileSystemTreeNodeBase = {
  name: string;
  /** Explorer-relative path (mount-relative, or virtual when `virtualPath` is used). */
  path: string;
  children: FileSystemTreeNode[];
};

export type FileSystemDirectoryTreeNode = FileSystemTreeNodeBase & {
  isDirectory: true;
  /** Canonical filesystem path, including the scope prefix. */
  canonicalPath: string;
  contentType: null;
  fileId: null;
};

export type FileSystemFileTreeNode = FileSystemTreeNodeBase & {
  isDirectory: false;
  /** Null only for synthetic content nodes that are not filesystem entries. */
  canonicalPath: string | null;
  contentType: string | null;
  fileId: string | null;
};

export type FileSystemTreeNode =
  | FileSystemDirectoryTreeNode
  | FileSystemFileTreeNode;

export type FileExplorerVirtualScopeRoot = {
  /** Explorer path shown at the merged root. */
  path: string;
  /** Canonical filesystem mount path represented by this root. */
  canonicalPath: string;
};

export type FileExplorerBucket =
  | "tables"
  | "frames"
  | "texts"
  | "folders"
  | "images"
  | "code"
  | "nodes";

export type FileExplorerFilter = "all" | FileExplorerBucket;

export type FileExplorerSortMode = "last-modified" | "name-asc" | "name-desc";
