import { z } from "zod";

export const FreshserviceTicketSchema = z.object({
  id: z.number(),
  subject: z.string(),
  description_text: z.string().optional(),
  description: z.string().optional(),
  priority: z.number(),
  status: z.number(),
  source: z.number(),
  requester_id: z.number(),
  requested_for_id: z.number().optional(),
  responder_id: z.number().optional(),
  department_id: z.number().optional(),
  group_id: z.number().optional(),
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
  due_by: z.string().optional(),
  fr_due_by: z.string().optional(),
  is_escalated: z.boolean(),
  custom_fields: z.record(z.any()).optional(),
  cc_emails: z.array(z.string()).optional(),
  fwd_emails: z.array(z.string()).optional(),
  reply_cc_emails: z.array(z.string()).optional(),
  fr_escalated: z.boolean().optional(),
  spam: z.boolean().optional(),
  email_config_id: z.number().nullable().optional(),
  to_emails: z.string().nullable().optional(),
  sla_policy_id: z.number().optional(),
  urgency: z.number().optional(),
  impact: z.number().optional(),
  category: z.string().nullable().optional(),
  sub_category: z.string().nullable().optional(),
  item_category: z.string().nullable().optional(),
  deleted: z.boolean().optional(),
  resolution_notes: z.string().nullable().optional(),
  resolution_notes_html: z.string().nullable().optional(),
  attachments: z
    .array(
      z.object({
        content_type: z.string(),
        size: z.number(),
        name: z.string(),
        attachment_url: z.string(),
        created_at: z.string(),
        updated_at: z.string(),
      })
    )
    .optional(),
  workspace_id: z.number().optional(),
  created_within_business_hours: z.boolean().optional(),
  approval_status: z.number().optional(),
  approval_status_name: z.string().optional(),
});

export type FreshserviceTicket = z.infer<typeof FreshserviceTicketSchema>;

export interface FreshserviceRequester {
  id: number;
  first_name: string;
  last_name: string;
  primary_email: string;
  mobile_phone_number?: string;
  work_phone_number?: string;
  department_ids?: number[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FreshserviceDepartment {
  id: number;
  name: string;
  description?: string;
  head_user_id?: number;
  prime_user_id?: number;
  created_at: string;
  updated_at: string;
}

export interface FreshserviceProduct {
  id: number;
  name: string;
  description?: string;
  asset_type_id: number;
  manufacturer?: string;
  status: string;
  mode_of_procurement?: string;
  created_at: string;
  updated_at: string;
}

export interface FreshserviceServiceItem {
  id: number;
  name: string;
  display_id: number;
  category_id: number;
  short_description?: string;
  description?: string;
  cost?: number;
  cost_visibility: boolean;
  delivery_time?: number;
  delivery_time_visibility: boolean;
  visibility: number;
  created_at: string;
  updated_at: string;
}

export interface FreshserviceServiceItemFieldChoice {
  id: number;
  value: string;
  display_id?: number;
  requester_display_value?: string;
  nested_options?: FreshserviceServiceItemFieldChoice[];
}

export interface FreshserviceServiceItemField {
  id: number;
  workspace_id?: number | null;
  created_at: string;
  updated_at: string;
  name: string;
  label: string;
  description?: string;
  field_type: string;
  required?: boolean;
  required_for_closure: boolean;
  default_field: boolean;
  choices: FreshserviceServiceItemFieldChoice[];
  nested_fields: any[];
  required_for_agents: boolean;
  required_for_customers: boolean;
  label_for_customers: string;
  customers_can_edit: boolean;
  displayed_to_customers: boolean;
  portal_cc?: boolean;
  portalcc_to?: string;
  belongs_to_section: boolean;
  sections: any[];
  position?: number;
  date_only?: boolean;
}

export interface FreshserviceSolutionArticle {
  id: number;
  title: string;
  description: string;
  article_type: number;
  folder_id: number;
  category_id?: number;
  status: number;
  approval_status: number;
  views: number;
  thumbs_up: number;
  thumbs_down: number;
  tags?: string[];
  keywords?: string[];
  created_at: string;
  updated_at: string;
}

export interface FreshserviceOnCallSchedule {
  id: number;
  name: string;
  description?: string;
  time_zone: string;
  created_at: string;
  updated_at: string;
}

// API Response interfaces
export interface FreshserviceListResponse<T> {
  [key: string]: T[];
}

export interface FreshserviceTicketFieldChoice {
  id: number;
  value: string;
  display_id?: number;
  requester_display_value?: string;
  nested_options?: FreshserviceTicketFieldChoice[];
}

export interface FreshserviceTicketField {
  id: number;
  workspace_id?: number | null;
  created_at: string;
  updated_at: string;
  name: string;
  label: string;
  description?: string;
  field_type: string;
  required?: boolean;
  required_for_closure: boolean;
  default_field: boolean;
  choices: FreshserviceTicketFieldChoice[];
  nested_fields: any[];
  required_for_agents: boolean;
  required_for_customers: boolean;
  label_for_customers: string;
  customers_can_edit: boolean;
  displayed_to_customers: boolean;
  portal_cc?: boolean;
  portalcc_to?: string;
  belongs_to_section: boolean;
  sections: any[];
  position?: number;
  date_only?: boolean;
}

// Error codes
export const FRESHSERVICE_ERROR_MESSAGES = {
  AUTHENTICATION_REQUIRED:
    "Authentication required. Please connect your Freshservice account.",
  DOMAIN_NOT_CONFIGURED: "Freshservice domain not configured.",
  TICKET_NOT_FOUND: "Ticket not found.",
  REQUESTER_NOT_FOUND: "Requester not found.",
  INVALID_PRIORITY:
    "Invalid priority. Must be 1 (Low), 2 (Medium), 3 (High), or 4 (Urgent).",
  INVALID_STATUS:
    "Invalid status. Must be 2 (Open), 3 (Pending), 4 (Resolved), or 5 (Closed).",
  API_ERROR: "API request failed",
};
