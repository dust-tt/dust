export interface User {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  portrait?: string;
}

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  backgroundColor: string;
  description: string;
}

export type MessageGroupType = "agent" | "locutor" | "interlocutor";

export interface AvatarData {
  visual?: string;
  emoji?: string;
  backgroundColor?: string;
  isRounded?: boolean;
}

export interface MessageReactionData {
  emoji: string;
  count: number;
  reactedByLocutor: boolean;
}

export interface MessageCitationData {
  id: string;
  title: string;
  icon: "table" | "document" | "slack" | "notion" | "image";
  imgSrc?: string;
}

export interface MessageAttachmentData {
  id: string;
  label: string;
  icon: "document";
}

export interface MessageActionCardData {
  id: string;
  title: string;
  acceptedTitle?: string;
  rejectedTitle?: string;
  description: string;
  applyLabel: string;
  rejectLabel: string;
  cardVariant?: "highlight" | "secondary";
  actionsPosition?: "header" | "footer";
  state?: "active" | "disabled" | "accepted" | "rejected";
  visual?: {
    emoji: string;
    backgroundColor: string;
  };
}

export interface MessageInfoChipData {
  icon: "bolt";
}

export interface MessageGroupData {
  id: string;
  type: MessageGroupType;
  name?: string;
  timestamp?: string;
  infoChip?: MessageInfoChipData;
  completionStatus?: string;
  avatar?: AvatarData;
}

export interface ConversationMessage {
  kind: "message";
  id: string;
  content?: string;
  markdown?: string;
  attachments?: MessageAttachmentData[];
  actionCards?: MessageActionCardData[];
  citations?: MessageCitationData[];
  reactions?: MessageReactionData[];
  timestamp: Date;
  ownerId: string; // user ID or agent ID
  ownerType: "user" | "agent";
  type: "user" | "agent"; // for legacy usage
  group: MessageGroupData;
}

export interface ConversationSection {
  kind: "section";
  id: string;
  label: string;
}

export interface ConversationActiveIndicator {
  kind: "activeIndicator";
  id: string;
  type: MessageGroupType;
  name?: string;
  action: string;
  avatar?: AvatarData;
}

export type ConversationItem =
  | ConversationMessage
  | ConversationSection
  | ConversationActiveIndicator;

export type Message = ConversationMessage;

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  userParticipants: string[];
  agentParticipants: string[];
  messages?: ConversationItem[];
  description?: string;
  spaceId?: string;
}

export interface Space {
  id: string;
  name: string;
  description: string;
  isPublic?: boolean;
}

export interface DataSource {
  id: string;
  fileName: string;
  fileType: "pdf" | "doc" | "docx" | "xlsx" | "pptx" | "txt" | "md";
  createdBy: string; // user ID
  createdAt: Date;
  updatedAt: Date;
  icon?: React.ComponentType<{ className?: string }>; // Icon component
}
