import type { FilePanelCategory } from "@app/components/file_explorer/types";
import type {
  AttachmentCreator,
  GetConversationAttachmentsResponseBody,
} from "@app/types/api/assistant/conversation/attachments";

export type ConversationAttachmentItem =
  GetConversationAttachmentsResponseBody["attachments"][number];

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
