import type React from "react";

import type {
  AllSupportedFileContentType,
  SupportedContentFragmentType,
  SupportedFileContentType,
} from "@app/types";

export type FileAttachment = {
  type: "file";
  id: string;
  title: string;
  contentType: SupportedFileContentType;
  isUploading: boolean;
  onRemove: () => void;
  description?: string;
  sourceUrl?: string;
};

export type NodeAttachment = {
  type: "node";
  id: string;
  title: string;
  spaceName: string;
  spaceIcon: React.ComponentType;
  visual: React.ReactNode;
  path: string;
  onRemove: () => void;
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

export interface MarkdownAttachmentCitation extends BaseAttachmentCitation {
  type: "markdown";
  attachmentCitationType: "mcp";
  fileId: string;
  isUploading: false;

  contentType:
    | AllSupportedFileContentType
    | "application/vnd.dust.tool-output.data-source-search-result"
    | "application/vnd.dust.tool-output.websearch-result";
}

export type AttachmentCitation =
  | FileAttachmentCitation
  | NodeAttachmentCitation
  | MarkdownAttachmentCitation;
