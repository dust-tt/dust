import type { AttachmentCreator } from "@app/lib/api/assistant/conversation/attachments";
import type { GetConversationAttachmentsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/attachments";
import type { ReactNode } from "react";

export type ConversationAttachmentItem =
  GetConversationAttachmentsResponseBody["attachments"][number];

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

export type FilePanelRow = {
  id?: string;
  title: string;
  contentType: string;
  fileId: string | null;
  category: FilePanelCategory;
  action?: ReactNode;
  creator?: AttachmentCreator | null;
  date: number | null;
  isHighlighted?: boolean;
  isInProjectContext?: boolean;
  onClick?: () => void;
  source?: "agent" | "user" | null;
  subtitle?: string;
  thumbnailUrl?: string;
};

export type ConversationAttachmentRow = FilePanelRow & {
  source: "agent" | "user" | null;
  isInProjectContext: boolean;
  creator: AttachmentCreator | null;
};

export type SandboxTreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  contentType: string | null;
  fileId: string | null;
  children: SandboxTreeNode[];
};
