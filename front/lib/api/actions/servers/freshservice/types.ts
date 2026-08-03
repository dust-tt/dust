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

// Default fields for list operations
export const DEFAULT_TICKET_FIELDS_LIST = [
  "id",
  "subject",
  "status",
] as const satisfies ReadonlyArray<keyof FreshserviceTicket>;

// Default fields for detail operations
export const DEFAULT_TICKET_FIELDS_DETAIL = [
  "id",
  "subject",
  "description_text",
  "priority",
  "status",
  "requester_id",
  "responder_id",
  "department_id",
  "group_id",
  "type",
  "created_at",
  "updated_at",
  "due_by",
] as const satisfies ReadonlyArray<keyof FreshserviceTicket>;
