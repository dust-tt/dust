import type { TimeFrame } from "@app/shared/lib/time_frame";
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

function renderMimeType(mimeType: string) {
  return mimeType
    .replace("application/vnd.dust.", "")
    .replace("-", " ")
    .replace(".", " ");
}

function renderRelativeTimeFrameForToolOutput(
  relativeTimeFrame: TimeFrame | null
): string {
  return relativeTimeFrame
    ? "over the last " +
        (relativeTimeFrame.duration > 1
          ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
          : `${relativeTimeFrame.unit}`)
    : "across all time periods";
}

function renderTagsForToolOutput(
  tagsIn?: string[],
  tagsNot?: string[]
): string {
  const tagsInAsString =
    tagsIn && tagsIn.length > 0 ? `, with labels ${tagsIn?.join(", ")}` : "";
  const tagsNotAsString =
    tagsNot && tagsNot.length > 0
      ? `, excluding labels ${tagsNot?.join(", ")}`
      : "";
  return `${tagsInAsString}${tagsNotAsString}`;
}

function renderSearchNodeIds(nodeIds?: string[]): string {
  return nodeIds && nodeIds.length > 0
    ? `within ${nodeIds.length} different subtrees `
    : "";
}

export function makeQueryTextForDataSourceSearch({
  query,
  timeFrame,
  tagsIn,
  tagsNot,
  nodeIds,
}: {
  query: string;
  timeFrame: TimeFrame | null;
  tagsIn?: string[];
  tagsNot?: string[];
  nodeIds?: string[];
}): string {
  const timeFrameAsString = renderRelativeTimeFrameForToolOutput(timeFrame);
  const tagsAsString = renderTagsForToolOutput(tagsIn, tagsNot);
  const nodeIdsAsString = renderSearchNodeIds(nodeIds);

  return query
    ? `Searching "${query}" ${nodeIdsAsString}${timeFrameAsString}${tagsAsString}.`
    : `Searching ${timeFrameAsString}${tagsAsString}.`;
}

export const IncludeInputSchema = z.object({
  timeFrame: z.string().optional(),
});

export function isIncludeInputType(
  input: Record<string, unknown>
): input is z.infer<typeof IncludeInputSchema> {
  return IncludeInputSchema.safeParse(input).success;
}

export function renderRelativeTimeFrame(
  relativeTimeFrame: TimeFrame | null
): string {
  return renderRelativeTimeFrameForToolOutput(relativeTimeFrame);
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

export function makeQueryTextForFind({
  query,
  rootNodeId,
  mimeTypes,
  nextPageCursor,
}: {
  query?: string;
  rootNodeId?: string;
  mimeTypes?: string[];
  nextPageCursor?: string;
}): string {
  const queryText = query ? ` "${query}"` : " all content";
  const scope = rootNodeId
    ? ` under ${rootNodeId}`
    : " across the entire data sources";
  const types = mimeTypes?.length
    ? ` (${mimeTypes.map(renderMimeType).join(", ")} files)`
    : "";
  const pagination = nextPageCursor ? " - next page" : "";

  return `Searching for${queryText}${scope}${types}${pagination}.`;
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

export function makeQueryTextForList({
  nodeId,
  mimeTypes,
  nextPageCursor,
}: {
  nodeId: string | null;
  mimeTypes?: string[];
  nextPageCursor?: string;
}): string {
  const location = nodeId ? ` within node "${nodeId}"` : " at the root level";
  const types = mimeTypes?.length
    ? ` (${mimeTypes.map(renderMimeType).join(", ")} files)`
    : "";
  const pagination = nextPageCursor ? " - next page" : "";

  return `Listing content${location}${types}${pagination}.`;
}
