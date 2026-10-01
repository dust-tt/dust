// This file should remain synchronized with connectors/src/connectors/zendesk/lib/types.ts

import z from "zod";

// Subdomain validation function
export function isValidZendeskSubdomain(s: unknown): s is string {
  return (
    typeof s === "string" && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)
  );
}

export const ZendeskPaginatedResponseSchema = z.object({
  meta: z
    .object({
      has_more: z.boolean(),
      after_cursor: z.string().nullable().optional(),
      before_cursor: z.string().nullable().optional(),
    })
    .optional(),
  links: z
    .object({
      prev: z.string().nullable().optional(),
      next: z.string().nullable().optional(),
    })
    .optional(),
});

// Ticket schemas
export const ZendeskTicketSchema = z
  .object({
    id: z.number(),
    url: z.string(),
    subject: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    priority: z.string().nullable().optional(),
    status: z.string().optional(),
    type: z.string().nullable().optional(),
    requester_id: z.number().optional(),
    assignee_id: z.number().nullable().optional(),
    group_id: z.number().nullable().optional(),
    organization_id: z.number().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    tags: z.array(z.string()).optional(),
    custom_fields: z
      .array(
        z.object({
          id: z.number(),
          value: z.union([
            z.string(),
            z.number(),
            z.boolean(),
            z.null(),
            z.array(z.string()),
          ]),
        })
      )
      .optional(),
    via: z
      .object({
        channel: z.string(),
        source: z.object({}).passthrough().optional(),
      })
      .passthrough()
      .optional(),
    brand_id: z.number().optional(),
    collaborator_ids: z.array(z.number()).optional(),
    follower_ids: z.array(z.number()).optional(),
    email_cc_ids: z.array(z.number()).optional(),
    due_at: z.string().nullable().optional(),
    has_incidents: z.boolean().optional(),
    satisfaction_rating: z
      .object({
        comment: z.string().optional().nullable(),
        id: z.number().optional().nullable(),
        score: z.string(),
      })
      .optional(),
    submitter_id: z.number().optional(),
  })
  .passthrough();

export type ZendeskTicket = z.infer<typeof ZendeskTicketSchema>;

export const ZendeskTicketResponseSchema = z.object({
  ticket: ZendeskTicketSchema,
});

export const ZendeskSearchResponseSchema = z.object({
  results: z.array(ZendeskTicketSchema),
  count: z.number(),
  next_page: z.string().nullable(),
  previous_page: z.string().nullable(),
});

export type ZendeskSearchResponse = z.infer<typeof ZendeskSearchResponseSchema>;

// Ticket metrics schemas
export const ZendeskTicketMetricsSchema = z.object({
  id: z.number(),
  ticket_id: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  group_stations: z.number(),
  assignee_stations: z.number(),
  reopens: z.number(),
  replies: z.number(),
  assignee_updated_at: z.string().nullable(),
  requester_updated_at: z.string().nullable(),
  status_updated_at: z.string().nullable(),
  initially_assigned_at: z.string().nullable(),
  assigned_at: z.string().nullable(),
  solved_at: z.string().nullable(),
  latest_comment_added_at: z.string().nullable(),
  reply_time_in_minutes: z
    .object({
      calendar: z.number().nullable(),
      business: z.number().nullable(),
    })
    .nullable(),
  first_resolution_time_in_minutes: z
    .object({
      calendar: z.number().nullable(),
      business: z.number().nullable(),
    })
    .nullable(),
  full_resolution_time_in_minutes: z
    .object({
      calendar: z.number().nullable(),
      business: z.number().nullable(),
    })
    .nullable(),
  agent_wait_time_in_minutes: z
    .object({
      calendar: z.number().nullable(),
      business: z.number().nullable(),
    })
    .nullable(),
  requester_wait_time_in_minutes: z
    .object({
      calendar: z.number().nullable(),
      business: z.number().nullable(),
    })
    .nullable(),
  on_hold_time_in_minutes: z
    .object({
      calendar: z.number().nullable(),
      business: z.number().nullable(),
    })
    .nullable(),
  url: z.string(),
});

export type ZendeskTicketMetrics = z.infer<typeof ZendeskTicketMetricsSchema>;

export const ZendeskTicketMetricsResponseSchema = z.object({
  ticket_metric: ZendeskTicketMetricsSchema,
});

// User schemas
export const ZendeskUserSchema = z
  .object({
    id: z.number(),
    url: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    active: z.boolean(),
    role: z.enum(["end-user", "agent", "admin"]),
  })
  .passthrough();

export type ZendeskUser = z.infer<typeof ZendeskUserSchema>;

export const ZendeskUsersResponseSchema = z.object({
  users: z.array(ZendeskUserSchema),
  next_page: z.string().nullable().optional(),
});

// Ticket field schemas
export const ZendeskTicketFieldSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    active: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();

export type ZendeskTicketField = z.infer<typeof ZendeskTicketFieldSchema>;

export const ZendeskTicketFieldsResponseSchema = z.object({
  ticket_fields: z.array(ZendeskTicketFieldSchema),
});

// Attachment schemas
export const ZendeskAttachmentSchema = z
  .object({
    id: z.number(),
    file_name: z.string(),
    content_url: z.string(),
    content_type: z.string(),
    size: z.number(),
    inline: z.boolean().optional(),
    deleted: z.boolean().optional(),
  })
  .passthrough();

// Ticket comment schemas
export const ZendeskTicketCommentSchema = z
  .object({
    id: z.number(),
    body: z.string(),
    author_id: z.number(),
    created_at: z.string(),
    plain_body: z.string().optional(),
    attachments: z.array(ZendeskAttachmentSchema).optional(),
  })
  .passthrough();

export type ZendeskTicketComment = z.infer<typeof ZendeskTicketCommentSchema>;

export const ZendeskTicketCommentsResponseSchema =
  ZendeskPaginatedResponseSchema.extend({
    comments: z.array(ZendeskTicketCommentSchema),
  });

// Tags schemas
export const ZendeskTagsResponseSchema = z.object({
  tags: z.array(z.string()),
});
