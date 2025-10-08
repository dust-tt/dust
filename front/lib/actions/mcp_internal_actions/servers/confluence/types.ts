import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export type ConfluenceErrorResult = string;
export type WithAuthParams = {
  authInfo?: AuthInfo;
  action: (baseUrl: string, accessToken: string) => Promise<CallToolResult>;
};

// Schema for Atlassian resource information
export const AtlassianResourceSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    scopes: z.array(z.string()).optional(),
    avatarUrl: z.string().optional(),
  })
);

export const ConfluenceCurrentUserSchema = z.object({
  account_id: z.string(),
  account_type: z.string().optional().default("atlassian"),
  email: z.string().optional(),
  name: z.string(),
  nickname: z.string().optional(),
});
export type ConfluenceCurrentUser = z.infer<typeof ConfluenceCurrentUserSchema>;

export const ConfluenceSearchRequestSchema = z.object({
  cql: z.string().describe("CQL query string"),
  cursor: z.string().optional().describe("Pagination cursor for next page"),
  limit: z
    .number()
    .optional()
    .describe("Number of results per page (default 25)"),
});

export type ConfluenceSearchRequest = z.infer<
  typeof ConfluenceSearchRequestSchema
>;

export type ConfluenceListPagesResult = z.infer<
  typeof ConfluenceListPagesResultSchema
>;

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
    parentId: z.string().nullable().optional(),
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

export type ConfluencePage = z.infer<typeof ConfluencePageSchema>;

export const ConfluenceListPagesResultSchema = z.object({
  results: z.array(ConfluencePageSchema),
  _links: z
    .object({
      next: z.string().optional(),
      base: z.string(),
    })
    .optional(),
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

export type ConfluenceCreatePageRequest = z.infer<
  typeof ConfluenceCreatePageRequestSchema
>;

// Schema for page creation payload
export const CreatePagePayloadSchema = z.object({
  spaceId: z.string(),
  title: z.string(),
  status: z.string().optional().default("current"),
  parentId: z.string().optional(),
  body: z
    .object({
      value: z.string(),
      representation: z.string(),
    })
    .optional(),
});

export type CreatePagePayload = z.infer<typeof CreatePagePayloadSchema>;

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

export type ConfluenceUpdatePageRequest = z.infer<
  typeof ConfluenceUpdatePageRequestSchema
>;

export const UpdatePagePayloadSchema = z.object({
  id: z.string(),
  version: z.object({
    number: z.number(),
    message: z.string().optional(),
  }),
  status: z.string().optional(),
  title: z.string().optional(),
  spaceId: z.string().optional(),
  parentId: z.string().optional(),
  body: z
    .object({
      representation: z.string(),
      value: z.string(),
    })
    .optional(),
});

export type UpdatePagePayload = z.infer<typeof UpdatePagePayloadSchema>;
