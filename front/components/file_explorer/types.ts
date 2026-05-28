import type { FileSystemFileEntry } from "@app/lib/api/file_system/types";
import type { ConnectorProvider } from "@app/types/data_source";
import type React from "react";

export type FileEntry = FileSystemFileEntry & { kind: "file" };
export type FileEntryWithId = FileEntry & { fileId: string };

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

export type FileExplorerEntry = FileEntry | ContentNodeEntry | FolderEntry;

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

export type FileSystemTreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  contentType: string | null;
  fileId: string | null;
  children: FileSystemTreeNode[];
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
