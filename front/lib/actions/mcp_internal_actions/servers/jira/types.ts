import { z } from "zod";

// Search filter constants and types
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

// Get regular field names (excluding customField)
const regularFieldNames = SEARCH_FILTER_FIELDS.filter(
  (field) => field !== "customField"
) as [string, ...string[]];

const baseFilterSchema = z.object({
  value: z.string().describe("The value to search for"),
  operator: z
    .enum(SUPPORTED_OPERATORS)
    .optional()
    .describe(
      `Operator for comparison. Supported operators: ${SUPPORTED_OPERATORS.join(", ")}. Only supported for date fields like 'dueDate', 'created', 'resolved'. For dates, use format '2023-07-03' or relative format like '-25d', '7d', '2w', '1M', etc.`
    ),
  fuzzy: z
    .boolean()
    .optional()
    .describe(
      "Use fuzzy search (~) for partial/similar matches instead of exact match (=). Only supported for 'summary' field. Use fuzzy when: searching for partial text, handling typos, finding related terms. Use exact when: looking for specific titles, precise matching needed."
    ),
});

const customFieldFilterSchema = baseFilterSchema.extend({
  field: z.literal("customField"),
  customFieldName: z
    .string()
    .describe(
      "The name of the custom field to search (e.g., 'Story Points', 'Epic Link')."
    ),
});

const regularFieldFilterSchema = baseFilterSchema.extend({
  field: z
    .enum(regularFieldNames)
    .describe(
      `The field to filter by. Must be one of: ${regularFieldNames.join(", ")}.`
    ),
});

export const JiraSearchFilterSchema = z.discriminatedUnion("field", [
  customFieldFilterSchema,
  regularFieldFilterSchema,
]);

// Sort schema using existing FIELD_MAPPINGS
export const JiraSortSchema = z.object({
  field: z
    .enum(SEARCH_FILTER_FIELDS as [SearchFilterField, ...SearchFilterField[]])
    .describe(
      `The field to sort by. Must be one of: ${SEARCH_FILTER_FIELDS.join(", ")}.`
    ),
  direction: z
    .enum(SORT_DIRECTIONS)
    .describe(`Sort direction. Must be one of: ${SORT_DIRECTIONS.join(", ")}.`),
});

// Jira entity schemas - shared field definitions
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

export const JiraResourceSchema = z.array(
  z.object({
    id: z.string(),
    url: z.string(),
    name: z.string(),
  })
);

export const JiraProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});

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
  fields: z.array(z.unknown()), // JIRA returns an array of field definitions, not an object
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
// Based on: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
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

// Base content node with recursive structure
export const ADFContentNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("type", [
    // Text nodes
    ADFTextNodeSchema,
    ADFHardBreakNodeSchema,

    // Block nodes with content
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

    // Code block (has text content instead of nested content)
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

    // Self-closing nodes
    ADFRuleNodeSchema,

    // Table nodes
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
  .passthrough(); // Allow custom fields

// Schema for update operations that allows ADF format for description and any string field
export const JiraUpdateIssueRequestSchema = z
  .record(
    z.union([
      z.string(),
      ADFDocumentSchema,
      z.object({}).passthrough(), // For complex field types like assignee, priority
      z.array(z.string()), // For arrays like labels (most common case)
      z.null(),
    ])
  )
  .describe(
    "Issue field updates - string fields can be plain text or ADF format"
  );

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

export const JiraIssueLinkSchema = z.object({
  id: z.string(),
  type: JiraIssueLinkTypeSchema,
  inwardIssue: z
    .object({
      key: z.string(),
      fields: z
        .object({
          summary: z.string(),
        })
        .optional(),
    })
    .optional(),
  outwardIssue: z
    .object({
      key: z.string(),
      fields: z
        .object({
          summary: z.string(),
        })
        .optional(),
    })
    .optional(),
});

export const JiraCreateIssueLinkRequestSchema = z.object({
  type: z.object({
    name: z
      .string()
      .describe("Link type name (e.g., 'Blocks', 'Relates', 'Duplicates')"),
  }),
  inwardIssue: z.object({
    key: z
      .string()
      .describe("Issue key that will be on the 'inward' side of the link"),
  }),
  outwardIssue: z.object({
    key: z
      .string()
      .describe("Issue key that will be on the 'outward' side of the link"),
  }),
  comment: z
    .object({
      body: z.string(),
    })
    .optional()
    .describe("Optional comment when creating the link"),
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

// JIRA Comment schema (defined after ADF schemas to avoid circular dependency)
export const JiraCommentSchema = z.object({
  id: z.string(),
  body: ADFDocumentSchema,
});

// Inferred types
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
export type JiraUpdateIssueRequest = z.infer<
  typeof JiraUpdateIssueRequestSchema
>;
export type JiraIssueLink = z.infer<typeof JiraIssueLinkSchema>;
export type JiraIssueLinkType = z.infer<typeof JiraIssueLinkTypeSchema>;
export type JiraCreateIssueLinkRequest = z.infer<
  typeof JiraCreateIssueLinkRequestSchema
>;
