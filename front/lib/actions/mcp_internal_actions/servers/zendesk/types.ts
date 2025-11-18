import z from "zod";

export const ZendeskTicketSchema = z
  .object({
    id: z.number(),
    url: z.string(),
    subject: z.string().nullable(),
    description: z.string().nullable(),
    priority: z.string().nullable(),
    status: z.string(),
    type: z.string().nullable(),
    requester_id: z.number(),
    assignee_id: z.number().nullable(),
    group_id: z.number().nullable(),
    organization_id: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    tags: z.array(z.string()),
    custom_fields: z.array(
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
    ),
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
  })
  .passthrough();

export type ZendeskTicket = z.infer<typeof ZendeskTicketSchema>;

export const ZendeskTicketResponseSchema = z.object({
  ticket: ZendeskTicketSchema,
});

export type ZendeskTicketResponse = z.infer<typeof ZendeskTicketResponseSchema>;

export const ZendeskSearchResponseSchema = z.object({
  results: z.array(ZendeskTicketSchema),
  count: z.number(),
  next_page: z.string().nullable(),
  previous_page: z.string().nullable(),
});

export type ZendeskSearchResponse = z.infer<typeof ZendeskSearchResponseSchema>;

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
