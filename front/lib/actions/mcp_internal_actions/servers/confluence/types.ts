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
    .min(1)
    .max(250)
    .optional()
    .default(25)
    .describe("Number of results per page (max 250)"),
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

export const ConfluenceListPagesResultSchema = z.object({
  results: z.array(ConfluencePageSchema),
  _links: z
    .object({
      next: z.string().optional(),
      base: z.string(),
    })
    .optional(),
});
