import type React from "react";

import type {
  AllSupportedWithDustSpecificFileContentType,
  SupportedContentFragmentType,
  SupportedFileContentType,
} from "@app/types";

export type FileAttachment = {
  type: "file";
  // Client-side blob identifier for local operations (removal, deduplication, local content lookup).
  // For regular uploads this equals the filename during upload. For tool uploads this is a custom
  // key like "tool-{serverViewId}-{externalId}".
  id: string;
  title: string;
  contentType: SupportedFileContentType;
  isUploading: boolean;
  onRemove?: () => void;
  description?: string;
  sourceUrl?: string;
  iconName?: string;
  // Server-side file resource sId for API calls (fetching content, downloading).
  // Null while the file is still uploading.
  fileId: string | null;
};

export type NodeAttachment = {
  type: "node";
  id: string;
  title: string;
  spaceName: string;
  spaceIcon: React.ComponentType;
  visual: React.ReactNode;
  path: string;
  onRemove?: () => void;
  url: string | null;
};

export type Attachment = FileAttachment | NodeAttachment;

interface BaseAttachmentCitation {
  id: string;
  attachmentCitationType: "fragment" | "inputBar" | "mcp";
  title: string;
  sourceUrl: string | null;
  visual: React.ReactNode;
  onRemove?: () => void;
}

export interface FileAttachmentCitation extends BaseAttachmentCitation {
  type: "file";

  contentType: SupportedContentFragmentType;
  description: string | null;
  fileId: string | null;
  isUploading?: boolean;
}

export interface NodeAttachmentCitation extends BaseAttachmentCitation {
  type: "node";

  path?: string;
  spaceIcon?: React.ComponentType;
  spaceName: string;
}

export interface MCPAttachmentCitation extends BaseAttachmentCitation {
  type: "file";
  attachmentCitationType: "mcp";
  fileId: string;
  isUploading: false;
  description?: string;

  contentType: AllSupportedWithDustSpecificFileContentType;
}

export type AttachmentCitation =
  | FileAttachmentCitation
  | NodeAttachmentCitation
  | MCPAttachmentCitation;
