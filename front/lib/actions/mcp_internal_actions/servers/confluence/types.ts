import { z } from "zod";

export const ConfluenceUserSchema = z.object({
  accountId: z.string(),
  email: z.string().optional(),
  displayName: z.string(),
  profilePicture: z
    .object({
      path: z.string(),
      width: z.number(),
      height: z.number(),
      isDefault: z.boolean(),
    })
    .optional(),
});

export const ConfluenceSpaceSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z
    .object({
      plain: z
        .object({
          value: z.string(),
          representation: z.literal("plain"),
        })
        .optional(),
      view: z
        .object({
          value: z.string(),
          representation: z.literal("view"),
        })
        .optional(),
    })
    .optional(),
  type: z.string(),
  status: z.string(),
  homepageId: z.string().optional(),
  _links: z
    .object({
      webui: z.string(),
      self: z.string(),
    })
    .optional(),
});

export const ConfluencePageBodySchema = z.object({
  storage: z
    .object({
      value: z.string(),
      representation: z.literal("storage"),
    })
    .optional(),
  view: z
    .object({
      value: z.string(),
      representation: z.literal("view"),
    })
    .optional(),
  atlas_doc_format: z
    .object({
      value: z.string(),
      representation: z.literal("atlas_doc_format"),
    })
    .optional(),
});

export const ConfluencePageSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    title: z.string(),
    parentId: z.string().optional(),
    spaceId: z.string().optional(),
    body: ConfluencePageBodySchema.optional(),
  })
  .passthrough()
  .transform((data) => ({
    id: data.id,
    status: data.status,
    title: data.title,
    parentId: data.parentId,
    spaceId: data.spaceId,
    body: data.body,
  }));

export const ConfluenceListSpacesRequestSchema = z.object({
  ids: z
    .array(z.string())
    .optional()
    .describe("List of space IDs to filter by"),
  keys: z
    .array(z.string())
    .optional()
    .describe("List of space keys to filter by"),
  type: z.enum(["global", "personal"]).optional().describe("Space type filter"),
  status: z
    .enum(["current", "archived"])
    .optional()
    .describe("Space status filter"),
  labels: z.array(z.string()).optional().describe("Filter spaces by labels"),
  favourite: z.boolean().optional().describe("Filter by favorite spaces"),
  sort: z
    .enum(["id", "key", "name", "created-date", "favourite"])
    .optional()
    .describe("Field to sort results by"),
  cursor: z.string().optional().describe("Pagination cursor for next page"),
  limit: z
    .number()
    .min(1)
    .max(250)
    .optional()
    .default(25)
    .describe("Number of results per page (max 250)"),
});

export const ConfluenceListPagesRequestSchema = z.object({
  ids: z.array(z.string()).optional().describe("List of page IDs to filter by"),
  spaceId: z.string().optional().describe("Space ID to filter pages by"),
  parentId: z
    .string()
    .optional()
    .describe("Parent page ID to filter child pages"),
  title: z.string().optional().describe("Page title to search for"),
  status: z
    .enum(["current", "trashed", "draft", "archived"])
    .optional()
    .describe("Page status to filter by"),
  sort: z
    .enum(["id", "created-date", "modified-date", "title"])
    .optional()
    .describe("Field to sort results by"),
  cursor: z.string().optional().describe("Pagination cursor for next page"),
  limit: z
    .number()
    .min(1)
    .max(250)
    .optional()
    .default(25)
    .describe("Number of results per page (max 250)"),
});

export const ConfluenceCreatePageRequestSchema = z.object({
  spaceId: z
    .string()
    .describe("The ID of the space where the page will be created"),
  status: z
    .enum(["current", "draft"])
    .optional()
    .default("current")
    .describe("Page status (default: current)"),
  title: z.string().describe("Page title"),
  parentId: z.string().optional().describe("Parent page ID (for child pages)"),
  body: z
    .object({
      representation: z.enum(["storage", "atlas_doc_format"]),
      value: z.string(),
    })
    .optional()
    .describe("Page body content"),
});

export const ConfluenceUpdatePageRequestSchema = z.object({
  id: z.string().describe("The page ID"),
  status: z
    .enum(["current", "trashed", "draft", "archived"])
    .optional()
    .describe("Page status"),
  title: z.string().optional().describe("Page title"),
  spaceId: z.string().optional().describe("Space ID"),
  parentId: z.string().optional().describe("Parent page ID"),
  body: z
    .object({
      representation: z.enum(["storage", "atlas_doc_format"]),
      value: z.string(),
    })
    .optional()
    .describe("Page body content"),
  version: z
    .object({
      number: z.number().describe("Version number (must be incremented)"),
      message: z.string().optional().describe("Version comment"),
    })
    .describe("Version information"),
});

export const ConfluenceListSpacesResultSchema = z.object({
  results: z.array(ConfluenceSpaceSchema),
  _links: z
    .object({
      next: z.string().optional(),
      base: z.string(),
    })
    .optional(),
});

export const ConfluenceListPagesResultSchema = z.object({
  results: z.array(ConfluencePageSchema),
  _links: z
    .object({
      next: z.string().optional(),
      base: z.string(),
    })
    .optional(),
});

export const ConfluenceCurrentUserSchema = z
  .object({
    account_id: z.string(),
    account_type: z.string().optional().default("atlassian"),
    email: z.string().optional(),
    name: z.string(),
    nickname: z.string().optional(),
  })
  .transform((data) => ({
    accountId: data.account_id,
    accountType: data.account_type,
    email: data.email,
    displayName: data.name,
    publicName: data.name,
  }));

export type ConfluenceUser = z.infer<typeof ConfluenceUserSchema>;
export type ConfluenceSpace = z.infer<typeof ConfluenceSpaceSchema>;
export type ConfluencePage = z.infer<typeof ConfluencePageSchema>;
export type ConfluenceListSpacesRequest = z.infer<
  typeof ConfluenceListSpacesRequestSchema
>;
export type ConfluenceListSpacesResult = z.infer<
  typeof ConfluenceListSpacesResultSchema
>;
export type ConfluenceListPagesRequest = z.infer<
  typeof ConfluenceListPagesRequestSchema
>;
export type ConfluenceCreatePageRequest = z.infer<
  typeof ConfluenceCreatePageRequestSchema
>;
export type ConfluenceUpdatePageRequest = z.infer<
  typeof ConfluenceUpdatePageRequestSchema
>;
export type ConfluenceListPagesResult = z.infer<
  typeof ConfluenceListPagesResultSchema
>;
export type ConfluenceCurrentUser = z.infer<typeof ConfluenceCurrentUserSchema>;

export const ConfluenceSearchRequestSchema = z.object({
  cql: z.string().describe("CQL query string"),
  cursor: z.string().optional().describe("Pagination cursor for next page"),
  limit: z
    .number()
    .min(1)
    .max(250)
    .optional()
    .default(25)
    .describe("Number of results per page (max 250)"),
});

export type ConfluenceSearchRequest = z.infer<
  typeof ConfluenceSearchRequestSchema
>;
