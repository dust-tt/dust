import { z } from "zod";

// Search filter constants and types
export const SEARCH_MAX_RESULTS = 20;

export const FIELD_MAPPINGS = {
  assignee: { jqlField: "assignee" },
  dueDate: { jqlField: "dueDate" },
  issueType: { jqlField: "issueType" },
  labels: { jqlField: "labels" },
  priority: { jqlField: "priority" },
  parentIssueKey: { jqlField: "parent" },
  project: { jqlField: "project" },
  reporter: { jqlField: "reporter" },
  status: { jqlField: "status" },
  summary: { jqlField: "summary", supportsFuzzy: true },
} as const;

export const SEARCH_FILTER_FIELDS = Object.keys(
  FIELD_MAPPINGS
) as (keyof typeof FIELD_MAPPINGS)[];

export type SearchFilterField = (typeof SEARCH_FILTER_FIELDS)[number];

export interface SearchFilter {
  field: string;
  value: string;
  fuzzy?: boolean;
}

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

export const JiraTransitionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const JiraTransitionsSchema = z.object({
  transitions: z.array(JiraTransitionSchema),
});

export const JiraCommentSchema = z.object({
  id: z.string(),
  body: z.object({
    type: z.string(),
    version: z.number(),
    content: z.array(
      z.object({
        type: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string() })),
      })
    ),
  }),
});

export const JiraCreateMetaSchema = z.object({
  fields: z.array(z.unknown()), // JIRA returns an array of field definitions, not an object
});

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

export const JiraCreateIssueRequestSchema = JiraIssueFieldsSchema.partial({
  description: true,
  priority: true,
  assignee: true,
  reporter: true,
  labels: true,
  parent: true,
});

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
export type JiraIssueLink = z.infer<typeof JiraIssueLinkSchema>;
export type JiraIssueLinkType = z.infer<typeof JiraIssueLinkTypeSchema>;
export type JiraCreateIssueLinkRequest = z.infer<
  typeof JiraCreateIssueLinkRequestSchema
>;
