// TODO(2025-08-06 aubin): add some validation to confirm we actually get these types.
export interface ZendeskFetchedBrand {
  url: string;
  id: number;
  name: string;
  brand_url: string;
  subdomain: string;
  host_mapping: string | null;
  has_help_center: boolean;
  help_center_state: string;
  active: boolean;
  default: boolean;
  is_deleted: boolean;
  logo: object | null;
  ticket_form_ids: number[];
  signature_template: string;
  created_at: string;
  updated_at: string;
}

export interface ZendeskFetchedSection {
  category_id?: number;
  created_at?: string;
  description?: string;
  html_url?: string;
  id?: number;
  locale: string;
  name: string;
  outdated?: boolean;
  parent_section_id?: number;
  position?: number;
  source_locale?: string;
  theme_template?: string;
  updated_at?: string;
  url?: string;
}

export interface ZendeskFetchedCategory {
  id: number;
  url: string;
  html_url: string;
  position: number;
  created_at: string;
  updated_at: string;
  name: string;
  description: string;
  locale: string;
  source_locale: string;
  outdated: boolean;
}

export interface ZendeskFetchedArticle {
  id: number;
  url: string;
  html_url: string;
  author_id: number;
  comments_disabled: boolean;
  draft: boolean;
  promoted: boolean;
  position: number;
  vote_sum: number;
  vote_count: number;
  section_id: number;
  created_at: string;
  updated_at: string;
  name: string;
  title: string;
  source_locale: string;
  locale: string;
  outdated: boolean;
  outdated_locales: string[];
  edited_at: string;
  user_segment_id: number;
  permission_group_id: number;
  content_tag_ids: number[];
  label_names?: string[];
  body: string | null;
  user_segment_ids: number[];
}

export interface ZendeskFetchedTicket {
  assignee_id: number;
  brand_id: number;
  collaborator_ids: number[];
  created_at: string; // ISO 8601 date string
  custom_fields: {
    id: number;
    value: string;
  }[];
  custom_status_id: number;
  description: string;
  due_at: string | null; // null or ISO 8601 date string
  external_id: string;
  follower_ids: number[];
  from_messaging_channel: boolean;
  generated_timestamp: number;
  group_id: number;
  has_incidents: boolean;
  id: number;
  organization_id: number | null;
  priority: string;
  problem_id: number;
  raw_subject: string;
  recipient: string;
  requester: { locale_id: number; name: string; email: string };
  requester_id: number;
  satisfaction_rating: {
    comment: string;
    id: number;
    score: string;
  };
  sharing_agreement_ids: number[];
  status: "new" | "open" | "pending" | "hold" | "solved" | "closed" | "deleted";
  subject: string | null;
  submitter_id: number;
  tags: string[];
  type: "problem" | "incident" | "question" | "task";
  updated_at: string; // ISO 8601 date string
  url: string;
  via: {
    channel: string;
  };
}

export interface ZendeskFetchedTicketComment {
  id: number;
  body: string;
  html_body: string;
  plain_body: string;
  public: boolean;
  author_id: number;
  created_at: string;
  attachments: {
    id: number;
    file_name: string;
    content_url: string;
  }[];
}

export interface ZendeskFetchedUser {
  active: boolean;
  alias: string;
  chat_only: boolean;
  created_at: string; // ISO 8601 date string
  custom_role_id: number;
  default_group_id: number;
  details: string;
  email: string;
  external_id: string;
  id: number;
  last_login_at: string; // ISO 8601 date string
  locale: string;
  locale_id: number;
  moderator: boolean;
  name: string;
  notes: string;
  only_private_comments: boolean;
  organization_id: number;
  phone: string;
  photo: {
    url: string;
    id: number;
    file_name: string;
    content_url: string;
    mapped_content_url: string;
  };
  report_csv: boolean;
  restricted_agent: boolean;
  role: "end-user" | "agent" | "admin";
  shared: boolean;
  shared_agent: boolean;
  signature: string;
  suspended: boolean;
  tags: string[];
  ticket_restriction: "requested" | "none" | "organization";
  time_zone: string;
  two_factor_auth_enabled: boolean;
  updated_at: string; // ISO 8601 date string
  url: string;
  verified: boolean;
}

export interface ZendeskFetchedOrganization {
  id: number;
  url: string;
  external_id: string;
  name: string;
  domain_names: string[];
  created_at: string;
  details: string;
  shared_comments: boolean;
  shared_tickets: boolean;
  tags: string[];
  group_id: number | null;
  notes: string | null;
  organization_fields: Record<string, string | number | boolean>;
  shared_brand_assets: boolean;
}

export interface ZendeskFetchedTicketField {
  id: number;
  title: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}
