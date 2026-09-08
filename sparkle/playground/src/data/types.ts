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
  icon: "table" | "document" | "slack" | "notion" | "image" | "frame";
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

export interface MessageTaskSuggestionItemData {
  id: string;
  text: string;
  groupTitle?: string;
  groupUserId?: string;
}

export interface MessageTaskSuggestionBoxData {
  id: string;
  title: string;
  variant: "created" | "suggestions";
  items: MessageTaskSuggestionItemData[];
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
  taskSuggestionBoxes?: MessageTaskSuggestionBoxData[];
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

export interface ConversationPendingValidation {
  kind: "pendingValidation";
  id: string;
  userMessage: ConversationMessage;
  agentMessage: ConversationMessage;
}

export type ConversationItem =
  | ConversationMessage
  | ConversationSection
  | ConversationActiveIndicator
  | ConversationPendingValidation;

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

export type DataSourceFileType =
  | "pdf"
  | "doc"
  | "docx"
  | "xlsx"
  | "csv"
  | "pptx"
  | "txt"
  | "md"
  | "png"
  | "frame";

export type DataSourceSource = "pod" | "company";

export interface DataSource {
  id: string;
  kind: "file" | "folder";
  fileName: string;
  parentId: string | null;
  source: DataSourceSource;
  fileType?: DataSourceFileType;
  createdBy: string; // user ID
  createdAt: Date;
  updatedAt: Date;
  icon?: React.ComponentType<{ className?: string }>; // Icon component
}

export type RequestType =
  | "spendLimitUpgrade"
  | "seatUpgrade"
  | "dataSourceAdd"
  | "toolAdd"
  | "connectorAdd"
  | "userInvitation"
  | "spaceAccess"
  | "roleChange"
  | "agentPublication"
  | "skillPublication"
  | "conversationAccess";

export type RequestStatus = "pending" | "done";

export type RequestOutcome = "approved" | "denied";

export type RequestTargetKind =
  | "workspace"
  | "space"
  | "user"
  | "agent"
  | "skill"
  | "tool"
  | "connector"
  | "conversation";

export interface RequestTarget {
  kind: RequestTargetKind;
  label: string;
  /** Id of the referenced mock entity, when the target maps to one. */
  id?: string;
}

/** A single labelled line of the type-specific payload, rendered in the detail panel. */
export interface RequestDetail {
  label: string;
  value: string;
}

export interface AdminRequest {
  id: string;
  type: RequestType;
  title: string;
  requesterId: string; // user ID
  createdAt: Date;
  target: RequestTarget;
  details: RequestDetail[];
  /** A note the requester wrote. Most requests come without one. */
  message?: string;
  status: RequestStatus;
  // Set once the request has been handled.
  outcome?: RequestOutcome;
  resolvedByUserId?: string;
  resolvedAt?: Date;
}
