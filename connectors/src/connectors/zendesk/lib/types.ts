export type IntercomHelpCenterType = {
  id: string;
  workspace_id: string;
  created_at: number;
  updated_at: number;
  identifier: string;
  website_turned_on: boolean;
  display_name: string | null;
};

export type IntercomCollectionType = {
  id: string;
  workspace_id: string;
  name: string;
  url: string | null;
  order: number;
  created_at: number;
  updated_at: number;
  description: string | null;
  icon: string | null;
  help_center_id: string | null;
  parent_id: string | null;
};

export type IntercomArticleType = {
  type: "article";
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  body: string;
  author_id: string;
  state: string;
  created_at: number;
  updated_at: number;
  url: string;
  parent_id: number | null;
  parent_type: string;
  parent_ids: number[];
};

export type IntercomTeamType = {
  type: "team";
  id: string;
  name: string;
  admin_ids: string[];
};

export type IntercomConversationType = {
  type: "conversation";
  id: string;
  created_at: number;
  updated_at: number;
  title: string | null;
  admin_assignee_id: number | null;
  team_assignee_id: number | null; // it says string in the API doc but it's actually a number
  open: boolean;
  tags: {
    type: "tag.list";
    tags: IntercomTagType[];
  };
  custom_attributes: {
    [key: string]: unknown; // string | number | boolean | custom intercom object
  };
  source: {
    type: string;
    id: number;
    delivered_as: string;
    subject: string;
    body: string;
    author: IntercomAuthor;
  };
};

export type IntercomConversationWithPartsType = IntercomConversationType & {
  conversation_parts: {
    type: "conversation_part.list";
    conversation_parts: ConversationPartType[];
    total_count: number;
  };
};

export type IntercomTagType = {
  type: "tag";
  id: string;
  name: string;
};

export type ConversationPartType = {
  type: "conversation_part";
  id: string;
  part_type: string;
  body: string;
  created_at: Date;
  updated_at: Date;
  notified_at: Date;
  assigned_to: {
    type: string;
    id: string;
  };
  author: IntercomAuthor;
  attachments: [];
  redacted: boolean;
};

export type IntercomAuthor = {
  id: string;
  type: "user" | "admin" | "bot" | "team";
  name: string;
  email: string;
};

export const INTERCOM_SYNC_ALL_CONVO_STATUSES = [
  "activated",
  "disabled",
  "scheduled_activate",
  "scheduled_revoke",
] as const;
export type IntercomSyncAllConversationsStatus =
  (typeof INTERCOM_SYNC_ALL_CONVO_STATUSES)[number];
