import type { GCSMountFileEntry } from "@app/lib/api/files/gcs_mount/files";
import type { ConnectorProvider } from "@app/types/data_source";
import type React from "react";

export type FileEntry = GCSMountFileEntry & { kind: "file" };
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

export type FileExplorerEntry = FileEntry | ContentNodeEntry;

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

export type SandboxTreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  contentType: string | null;
  fileId: string | null;
  children: SandboxTreeNode[];
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
