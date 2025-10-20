import { z } from "zod";

export const SearchInputSchema = z.object({
  query: z.string(),
  relativeTimeFrame: z.string().regex(/^(all|\d+[hdwmy])$/),
  tagsIn: z.array(z.string()).optional(),
  tagsNot: z.array(z.string()).optional(),
  nodeIds: z.array(z.string()).optional(),
});

export function isSearchInputType(
  input: Record<string, unknown>
): input is z.infer<typeof SearchInputSchema> {
  return SearchInputSchema.safeParse(input).success;
}

export const IncludeInputSchema = z.object({
  timeFrame: z.string().optional(),
});

export function isIncludeInputType(
  input: Record<string, unknown>
): input is z.infer<typeof IncludeInputSchema> {
  return IncludeInputSchema.safeParse(input).success;
}

export const WebsearchInputSchema = z.object({
  query: z.string(),
  page: z.number().optional(),
});

export type WebsearchInputType = z.infer<typeof WebsearchInputSchema>;

export function isWebsearchInputType(
  input: Record<string, unknown>
): input is WebsearchInputType {
  return WebsearchInputSchema.safeParse(input).success;
}

export const DataSourceFilesystemFindInputSchema = z.object({
  query: z.string().optional(),
  rootNodeId: z.string().optional(),
  mimeTypes: z.array(z.string()).optional(),
  limit: z.number().optional(),
  nextPageCursor: z.string().optional(),
});

export function isDataSourceFilesystemFindInputType(
  input: Record<string, unknown>
): input is z.infer<typeof DataSourceFilesystemFindInputSchema> {
  return DataSourceFilesystemFindInputSchema.safeParse(input).success;
}

export const DataSourceFilesystemListInputSchema = z.object({
  nodeId: z.string().nullable(),
  mimeTypes: z.array(z.string()).optional(),
  sortBy: z.enum(["title", "timestamp"]).optional(),
  limit: z.number().optional(),
  nextPageCursor: z.string().optional(),
});

export function isDataSourceFilesystemListInputType(
  input: Record<string, unknown>
): input is z.infer<typeof DataSourceFilesystemListInputSchema> {
  return DataSourceFilesystemListInputSchema.safeParse(input).success;
}
