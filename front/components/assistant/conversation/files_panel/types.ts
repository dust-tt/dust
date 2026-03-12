import type { GetConversationAttachmentsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/attachments";

export type ConversationAttachmentItem =
  GetConversationAttachmentsResponseBody["attachments"][number];

export type ConversationAttachmentRow = {
  title: string;
  contentType: string;
  fileId: string | null;
  source: "agent" | "user" | null;
  onClick?: () => void;
};

export type SandboxTreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  contentType: string;
  fileId: string | null;
  children: SandboxTreeNode[];
};
