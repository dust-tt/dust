import type { AttachmentCreator } from "@app/lib/api/assistant/conversation/attachments";
import type { GetConversationAttachmentsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/attachments";

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

export type ConversationAttachmentRow = {
  title: string;
  contentType: string;
  fileId: string | null;
  source: "agent" | "user" | null;
  category: FilePanelCategory;
  isInProjectContext: boolean;
  creator: AttachmentCreator | null;
  date: number | null;
  onClick?: () => void;
};

export type SandboxTreeNode = {
  name: string;
  path: string;
  contentType: string;
  fileId: string | null;
  children: SandboxTreeNode[];
};
