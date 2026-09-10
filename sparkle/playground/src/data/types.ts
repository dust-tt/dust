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

/**
 * The event families an admin works through. Cases that call for the same
 * decision share a type — a spend limit and a seat are both credit management,
 * so the admin gets one row and picks how to react.
 */
/** Workspace roles, named the way the product surfaces them to end users. */
export type RequestRole = "admin" | "manager" | "member";

export type RequestType =
  | "creditManagement"
  | "knowledgeManagement"
  | "toolAddition"
  | "memberInvitation"
  | "access"
  | "roleChange"
  | "publication";

/**
 * The case a request is, inside its type. It carries the row icon and decides
 * which payload the detail panel renders.
 */
export type RequestVariant =
  | "dataSource"
  | "connector"
  | "toolCreate"
  | "toolAddToSpace"
  | "podAccess"
  | "spaceAccess"
  | "agent"
  | "skill";

export type RequestStatus = "pending" | "done";

export type RequestOutcome = "approved" | "denied";

export type RequestTargetKind =
  | "workspace"
  | "pod"
  | "space"
  | "user"
  | "agent"
  | "skill"
  | "tool"
  | "connector";

/** The seat a member holds, named as the product names them. */
export type SeatType = "free" | "pro" | "max" | "platform";

/** Where a credit-management request stands when it lands on the queue. */
export interface RequestCredit {
  /** Share of the personal limit consumed. 100 or more reads "Over quota". */
  usedPercent: number;
  seatType: SeatType;
  /** Personal limit, in credits per month. */
  limit: number;
}

/** A document a knowledge request wants to bring in, listed like Pod files. */
export interface RequestDocument {
  name: string;
  fileType: DataSourceFileType;
  provider?: "slack" | "notion" | "drive" | "confluence" | "github";
}

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
  /** Set for the types that host more than one case. */
  variant?: RequestVariant;
  title: string;
  requesterId: string; // user ID
  /** Set when the request is made for someone else. */
  beneficiaryId?: string; // user ID
  createdAt: Date;
  /** What the request is about: a tool, an agent, a Pod, a member. */
  target: RequestTarget;
  /** Where the target lands, when that is a different place than the target. */
  destination?: RequestTarget;
  /**
   * The role being asked for. An invitation only carries the requested one,
   * since the invitee holds no role yet.
   */
  roles?: { current?: RequestRole; requested: RequestRole };
  /** Labelled payload lines. Types with a bespoke payload leave it out. */
  details?: RequestDetail[];
  /** Credit management only: the requester's quota, seat and limit. */
  credit?: RequestCredit;
  /** Knowledge management only: the documents the request brings in. */
  documents?: RequestDocument[];
  /**
   * A note the requester wrote. Most requests come without one; a connection
   * request always carries one, since it is all the admin has to judge it on.
   */
  message?: string;
  status: RequestStatus;
  // Set once the request has been handled.
  outcome?: RequestOutcome;
  resolvedByUserId?: string;
  resolvedAt?: Date;
  /** What the decision maker did, or why they declined. */
  resolutionMessage?: string;
}

// ── Triggers ─────────────────────────────────────────────────────────────────
// What runs an agent without anyone asking: a schedule or a webhook. A single
// editor owns one — the product has no subscribers — and every firing opens a
// conversation, which is what the Conversations tab lists.

export type TriggerKind = "schedule" | "webhook";

/**
 * The states a trigger can be in. The product also has `relocating` and
 * `downgraded`, which are transient and left out here.
 */
export type TriggerStatus = "enabled" | "disabled" | "disabled_by_manager";

/** Whose credits a run is charged to. */
export type TriggerPool = "member" | "workspace";

/** Platforms a webhook source can come from, limited to the ones with a logo. */
export type TriggerProvider =
  | "github"
  | "jira"
  | "zendesk"
  | "slack"
  | "notion";

export interface TriggerSchedule {
  /** Kept because the product stores one; the UI reads `label`. */
  cron: string;
  /** The cron in prose, the way the product renders it through cronstrue. */
  label: string;
  timezone: string;
}

export interface TriggerWebhook {
  provider: TriggerProvider;
  /** The webhook source as it is named in the workspace. */
  sourceName: string;
  /** The event that fires it, when the source narrows it down to one. */
  event?: string;
}

export interface Trigger {
  id: string;
  name: string;
  kind: TriggerKind;
  /** The agent the trigger runs. */
  agentId: string;
  /** The one user who owns it, and the only one who can edit it. */
  editorId: string;
  status: TriggerStatus;
  pool: TriggerPool;
  /** The Pod its conversations land in. Absent means the default space. */
  spaceId?: string;
  /** Set on schedule triggers. */
  schedule?: TriggerSchedule;
  /** Set on webhook triggers. */
  webhook?: TriggerWebhook;
  createdAt: Date;
  lastRunAt?: Date;
}
