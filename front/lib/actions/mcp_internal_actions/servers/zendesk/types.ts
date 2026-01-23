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
    due_at: z.string().nullable(),
    has_incidents: z.boolean(),
    satisfaction_rating: z
      .object({
        comment: z.string().optional().nullable(),
        id: z.number().optional().nullable(),
        score: z.string(),
      })
      .optional(),
    submitter_id: z.number(),
  })
  .passthrough();

export type ZendeskTicket = z.infer<typeof ZendeskTicketSchema>;

export const ZendeskTicketResponseSchema = z.object({
  ticket: ZendeskTicketSchema,
});

export type ZendeskTicketResponse = z.infer<typeof ZendeskTicketResponseSchema>;

export const ZendeskTicketsResponseSchema = z.object({
  tickets: z.array(ZendeskTicketSchema),
  next_page: z.string().nullable().optional(),
  previous_page: z.string().nullable().optional(),
  count: z.number().optional(),
  end_of_stream: z.boolean().optional(),
  after_url: z.string().nullable().optional(),
});

export type ZendeskTicketsResponse = z.infer<
  typeof ZendeskTicketsResponseSchema
>;

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

export type ZendeskTicketMetricsResponse = z.infer<
  typeof ZendeskTicketMetricsResponseSchema
>;

// Brand schemas
export const ZendeskBrandSchema = z
  .object({
    id: z.number(),
    url: z.string(),
    name: z.string(),
    subdomain: z.string(),
    brand_url: z.string(),
    has_help_center: z.boolean(),
  })
  .passthrough();

export type ZendeskBrand = z.infer<typeof ZendeskBrandSchema>;

export const ZendeskBrandResponseSchema = z.object({
  brand: ZendeskBrandSchema,
});

export const ZendeskBrandsResponseSchema = z.object({
  brands: z.array(ZendeskBrandSchema),
});

// Article schemas
export const ZendeskArticleSchema = z
  .object({
    id: z.number(),
    url: z.string(),
    title: z.string(),
    body: z.string().nullable(),
    section_id: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
    html_url: z.string(),
    author_id: z.number(),
    vote_sum: z.number(),
    name: z.string(),
    label_names: z.array(z.string()).optional(),
  })
  .passthrough();

export type ZendeskArticle = z.infer<typeof ZendeskArticleSchema>;

export const ZendeskArticleResponseSchema = z.object({
  article: ZendeskArticleSchema,
});

export const ZendeskArticlesResponseSchema =
  ZendeskPaginatedResponseSchema.extend({
    articles: z.array(ZendeskArticleSchema),
    end_time: z.number().optional(),
  });

// Category schemas
export const ZendeskCategorySchema = z
  .object({
    id: z.number(),
    url: z.string(),
    name: z.string(),
    locale: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    html_url: z.string(),
    description: z.string(),
  })
  .passthrough();

export type ZendeskCategory = z.infer<typeof ZendeskCategorySchema>;

export const ZendeskCategoryResponseSchema = z.object({
  category: ZendeskCategorySchema,
});

export const ZendeskCategoriesResponseSchema =
  ZendeskPaginatedResponseSchema.extend({
    categories: z.array(ZendeskCategorySchema),
  });

// Section schemas
export const ZendeskSectionSchema = z
  .object({
    id: z.number().optional(),
    url: z.string().optional(),
    name: z.string(),
    locale: z.string(),
    category_id: z.number().optional(),
    description: z.string().optional().nullable(),
  })
  .passthrough();

export type ZendeskSection = z.infer<typeof ZendeskSectionSchema>;

export const ZendeskSectionResponseSchema = z.object({
  section: ZendeskSectionSchema,
});

export const ZendeskSectionsResponseSchema = z.object({
  sections: z.array(ZendeskSectionSchema),
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

export const ZendeskUserResponseSchema = z.object({
  user: ZendeskUserSchema,
});

export const ZendeskUsersResponseSchema = z.object({
  users: z.array(ZendeskUserSchema),
  next_page: z.string().nullable().optional(),
});

// Organization schemas
export const ZendeskOrganizationSchema = z
  .object({
    id: z.number(),
    url: z.string(),
    name: z.string(),
    tags: z.array(z.string()),
    created_at: z.string(),
  })
  .passthrough();

export type ZendeskOrganization = z.infer<typeof ZendeskOrganizationSchema>;

export const ZendeskOrganizationResponseSchema = z.object({
  organization: ZendeskOrganizationSchema,
});

export const ZendeskOrganizationsResponseSchema = z.object({
  organizations: z.array(ZendeskOrganizationSchema),
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

export const ZendeskTicketFieldResponseSchema = z.object({
  ticket_field: ZendeskTicketFieldSchema,
});

export type ZendeskTicketFieldResponse = z.infer<
  typeof ZendeskTicketFieldResponseSchema
>;

export const ZendeskTicketFieldsResponseSchema = z.object({
  ticket_fields: z.array(ZendeskTicketFieldSchema),
});

export type ZendeskTicketFieldsResponse = z.infer<
  typeof ZendeskTicketFieldsResponseSchema
>;

// Ticket comment schemas
export const ZendeskTicketCommentSchema = z
  .object({
    id: z.number(),
    body: z.string(),
    author_id: z.number(),
    created_at: z.string(),
    plain_body: z.string().optional(),
  })
  .passthrough();

export type ZendeskTicketComment = z.infer<typeof ZendeskTicketCommentSchema>;

export const ZendeskTicketCommentsResponseSchema =
  ZendeskPaginatedResponseSchema.extend({
    comments: z.array(ZendeskTicketCommentSchema),
  });

// Search count schema
export const ZendeskSearchCountResponseSchema = z.object({
  count: z.string(),
});
