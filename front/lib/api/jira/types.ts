import { z } from "zod";

// Basic schemas for webhooks
export const JiraResourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  scopes: z.array(z.string()),
  avatarUrl: z.string(),
});

export const JiraProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  self: z.string().optional(),
});

export const JiraProjectsResponseSchema = z.object({
  values: z.array(JiraProjectSchema),
});

export const JiraWebhookRegistrationResultSchema = z.object({
  createdWebhookId: z.number().optional(),
  errors: z.array(z.string()).optional(),
});

export const JiraCreateWebhookResponseSchema = z.object({
  webhookRegistrationResult: z.array(JiraWebhookRegistrationResultSchema),
});

export const JiraWebhookSchema = z.object({
  id: z.number(),
  url: z.string(),
  events: z.array(z.string()),
  jqlFilter: z.string(),
  expirationDate: z.string(),
  fieldIdsFilter: z.array(z.string()).optional(),
  issuePropertyKeysFilter: z.array(z.string()).optional(),
});

export const JiraWebhooksResponseSchema = z.object({
  isLast: z.boolean(),
  maxResults: z.number(),
  startAt: z.number(),
  total: z.number(),
  values: z.array(JiraWebhookSchema),
});

// MCP-specific constants
export const SEARCH_ISSUES_MAX_RESULTS = 20;
export const SEARCH_USERS_MAX_RESULTS = 200;

export const SUPPORTED_OPERATORS = ["=", "<", ">", "<=", ">=", "!="] as const;
export type SupportedOperator = (typeof SUPPORTED_OPERATORS)[number];

export const SORT_DIRECTIONS = ["ASC", "DESC"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const FIELD_MAPPINGS = {
  assignee: { jqlField: "assignee" },
  created: { jqlField: "created", supportsOperators: true },
  dueDate: { jqlField: "dueDate", supportsOperators: true },
  fixVersion: { jqlField: "fixVersion" },
  issueType: { jqlField: "issueType" },
  labels: { jqlField: "labels" },
  priority: { jqlField: "priority" },
  parentIssueKey: { jqlField: "parent" },
  project: { jqlField: "project" },
  reporter: { jqlField: "reporter" },
  resolved: { jqlField: "resolved", supportsOperators: true },
  status: { jqlField: "status" },
  summary: { jqlField: "summary", supportsFuzzy: true },
  customField: {
    jqlField: "customField",
    isCustomField: true,
    supportsFuzzy: true,
  },
} as const;

export const SEARCH_FILTER_FIELDS = Object.keys(
  FIELD_MAPPINGS
) as (keyof typeof FIELD_MAPPINGS)[];

export type SearchFilterField = (typeof SEARCH_FILTER_FIELDS)[number];

export interface SearchFilter {
  field: string;
  value: string;
  fuzzy?: boolean;
  customFieldName?: string;
  operator?: SupportedOperator;
}

// Jira issue schemas
export const JiraIssueFieldsSchema = z
  .object({
    project: z.object({
      key: z.string(),
    }),
    summary: z.string(),
    description: z
      .object({
        type: z.string(),
        version: z.number(),
        content: z.array(
          z.object({
            type: z.string(),
            content: z.array(
              z.object({
                type: z.string(),
                text: z.string().optional(),
              })
            ),
          })
        ),
      })
      .nullable(),
    issuetype: z.object({
      name: z.string(),
    }),
    priority: z.object({
      name: z.string(),
    }),
    assignee: z
      .object({
        accountId: z.string(),
      })
      .nullable(),
    reporter: z
      .object({
        accountId: z.string(),
      })
      .nullable(),
    labels: z.array(z.string()).nullable(),
    duedate: z.string().nullable().optional(),
    parent: z
      .object({
        key: z.string(),
      })
      .nullable(),
  })
  .passthrough();

export const JiraIssueSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    browseUrl: z.string().optional(),
    fields: JiraIssueFieldsSchema.deepPartial().optional(),
  })
  .passthrough();

export const JiraProjectVersionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  released: z.boolean().optional(),
  releaseDate: z.string().optional(),
  startDate: z.string().optional(),
  archived: z.boolean().optional(),
});

export const JiraTransitionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const JiraTransitionsSchema = z.object({
  transitions: z.array(JiraTransitionSchema),
});

export const JiraCreateMetaSchema = z.object({
  fields: z.array(z.unknown()),
});

export const JiraFieldSchema = z.object({
  id: z.string(),
  key: z.string().optional(),
  name: z.string(),
  custom: z.boolean(),
  schema: z
    .object({
      type: z.string(),
      custom: z.string().optional(),
    })
    .optional(),
});

export const JiraFieldsSchema = z.array(JiraFieldSchema);

export const JiraSearchResultSchema = z.object({
  issues: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      fields: JiraIssueFieldsSchema.deepPartial().optional(),
    })
  ),
  isLast: z.boolean().optional(),
  nextPageToken: z.string().optional(),
});

export const JiraUserInfoSchema = z
  .object({
    accountId: z.string(),
    emailAddress: z.string(),
    displayName: z.string(),
    accountType: z.string(),
    locale: z.string().optional(),
  })
  .passthrough();

export const JiraConnectionInfoSchema = z.object({
  user: z.object({
    account_id: z.string(),
    name: z.string(),
    nickname: z.string(),
  }),
  instance: z.object({
    cloud_id: z.string(),
    site_url: z.string(),
    site_name: z.string(),
    api_base_url: z.string(),
  }),
});

export const JiraTransitionIssueSchema = z.void();

// Atlassian Document Format (ADF) schemas
export const ADFMarkSchema = z.object({
  type: z.string(),
  attrs: z.record(z.any()).optional(),
});

export type ADFMark = z.infer<typeof ADFMarkSchema>;

export const ADFTextNodeSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  marks: z.array(ADFMarkSchema).optional(),
});

export type ADFTextNode = z.infer<typeof ADFTextNodeSchema>;

export const ADFHardBreakNodeSchema = z.object({
  type: z.literal("hardBreak"),
});

export type ADFHardBreakNode = z.infer<typeof ADFHardBreakNodeSchema>;

export const ADFRuleNodeSchema = z.object({
  type: z.literal("rule"),
});

export type ADFRuleNode = z.infer<typeof ADFRuleNodeSchema>;

export const ADFContentNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("type", [
    ADFTextNodeSchema,
    ADFHardBreakNodeSchema,
    z.object({
      type: z.enum([
        "paragraph",
        "heading",
        "blockquote",
        "panel",
        "bulletList",
        "orderedList",
        "listItem",
      ]),
      attrs: z.record(z.any()).optional(),
      content: z.array(ADFContentNodeSchema).optional(),
    }),
    z.object({
      type: z.literal("codeBlock"),
      attrs: z.record(z.any()).optional(),
      content: z
        .array(
          z.object({
            type: z.literal("text"),
            text: z.string(),
          })
        )
        .optional(),
    }),
    ADFRuleNodeSchema,
    z.object({
      type: z.enum(["table", "tableRow", "tableCell", "tableHeader"]),
      attrs: z.record(z.any()).optional(),
      content: z.array(ADFContentNodeSchema).optional(),
    }),
  ])
);

export type ADFContentNode = z.infer<typeof ADFContentNodeSchema>;

export const ADFDocumentSchema = z.object({
  type: z.literal("doc"),
  version: z.literal(1),
  content: z.array(ADFContentNodeSchema).optional(),
});

export type ADFDocument = z.infer<typeof ADFDocumentSchema>;

export const JiraCreateIssueRequestSchema = JiraIssueFieldsSchema.partial({
  description: true,
  priority: true,
  assignee: true,
  reporter: true,
  labels: true,
  parent: true,
})
  .extend({
    description: z.union([z.string(), ADFDocumentSchema]).optional(),
  })
  .passthrough();

export const JiraSearchRequestSchema = z.object({
  jql: z.string(),
  maxResults: z.number(),
  fields: z.array(z.string()),
  nextPageToken: z.string().optional(),
});

export const JiraCreateCommentRequestSchema = z.object({
  body: z.object({
    type: z.literal("doc"),
    version: z.number(),
    content: z.array(
      z.object({
        type: z.string(),
        content: z.array(
          z.object({
            type: z.string(),
            text: z.string(),
          })
        ),
      })
    ),
  }),
  visibility: z
    .object({
      type: z.enum(["group", "role"]),
      value: z.string(),
    })
    .optional(),
});

export const JiraTransitionRequestSchema = z.object({
  transition: z.object({
    id: z.string(),
  }),
  update: z
    .object({
      comment: z.array(
        z.object({
          add: z.object({
            body: z.string(),
          }),
        })
      ),
    })
    .optional(),
});

export const JiraIssueLinkTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  inward: z.string(),
  outward: z.string(),
});

export const JiraCreateIssueLinkRequestSchema = z.object({
  type: z.object({
    name: z.string(),
  }),
  inwardIssue: z.object({
    key: z.string(),
  }),
  outwardIssue: z.object({
    key: z.string(),
  }),
  comment: z
    .object({
      body: z.string(),
    })
    .optional(),
});

export const JiraIssueTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  subtask: z.boolean().optional(),
});

export const JiraUserSchema = z.object({
  accountId: z.string(),
  displayName: z.string(),
  emailAddress: z.string().optional(),
  accountType: z.string(),
  active: z.boolean(),
});

export type JiraUser = z.infer<typeof JiraUserSchema>;

export const JiraUsersSearchResultSchema = z.array(JiraUserSchema);

export const JiraCommentSchema = z.object({
  id: z.string(),
  body: ADFDocumentSchema,
});

export const JiraAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  author: z.object({
    accountId: z.string(),
    displayName: z.string().optional(),
    emailAddress: z.string().optional(),
  }),
  created: z.string(),
  size: z.number(),
  mimeType: z.string(),
  content: z.string().optional(),
  thumbnail: z.string().optional(),
  self: z.string(),
});

export const JiraAttachmentsResultSchema = z.array(JiraAttachmentSchema);

export const JiraIssueWithAttachmentsSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z.object({
    attachment: z.array(JiraAttachmentSchema).optional(),
  }),
});

// Exported types
export type JiraResourceType = z.infer<typeof JiraResourceSchema>;
export type JiraProjectType = z.infer<typeof JiraProjectSchema>;
export type JiraWebhookType = z.infer<typeof JiraWebhookSchema>;
export type JiraSearchResult = z.infer<typeof JiraSearchResultSchema>;
export type JiraErrorResult = string;
export type JiraIssue = z.infer<typeof JiraIssueSchema>;
export type JiraProject = z.infer<typeof JiraProjectSchema>;
export type JiraTransition = z.infer<typeof JiraTransitionSchema>;
export type JiraComment = z.infer<typeof JiraCommentSchema>;
export type JiraUserInfo = z.infer<typeof JiraUserInfoSchema>;
export type JiraConnectionInfo = z.infer<typeof JiraConnectionInfoSchema>;
export type JiraCreateIssueRequest = z.infer<
  typeof JiraCreateIssueRequestSchema
>;
export type JiraIssueLinkType = z.infer<typeof JiraIssueLinkTypeSchema>;
export type JiraCreateIssueLinkRequest = z.infer<
  typeof JiraCreateIssueLinkRequestSchema
>;
export type JiraAttachment = z.infer<typeof JiraAttachmentSchema>;
export type JiraAttachmentsResult = z.infer<typeof JiraAttachmentsResultSchema>;
export type JiraIssueWithAttachments = z.infer<
  typeof JiraIssueWithAttachmentsSchema
>;
