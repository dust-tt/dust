import type { TimeFrame } from "@app/shared/lib/time_frame";
import { parseTimeFrame } from "@app/shared/lib/time_frame";
import { z } from "zod";

export const SearchInputSchema = z
  .object({
    query: z.string(),
    relativeTimeFrame: z.string().regex(/^(all|\d+[hdwmy])$/),
    tagsIn: z.array(z.string()).optional(),
    tagsNot: z.array(z.string()).optional(),
    nodeIds: z.array(z.string()).optional(),
  })
  .passthrough();

export function isSearchInputType(
  input: Record<string, unknown>
): input is z.infer<typeof SearchInputSchema> {
  return SearchInputSchema.safeParse(input).success;
}

export const TagsInputSchema = z.object({
  tagsIn: z
    .array(z.string())
    .optional()
    .describe(
      "A list of labels (also called tags) to restrict the search based on the user request and past conversation context." +
        "If multiple labels are provided, the search will return documents that have at least one of the labels." +
        "You can't check that all labels are present, only that at least one is present." +
        "If no labels are provided, the search will return all documents regardless of their labels."
    ),
  tagsNot: z
    .array(z.string())
    .optional()
    .describe(
      "A list of labels (also called tags) to exclude from the search based on the user request and past conversation context." +
        "Any document having one of these labels will be excluded from the search."
    ),
});

type TagsInputType = z.infer<typeof TagsInputSchema>;

export const SearchWithNodesInputSchema = SearchInputSchema.extend({
  nodeIds: z
    .array(z.string())
    .describe(
      "Array of exact content node IDs to search within. These are the 'nodeId' values from " +
        "previous search results, which can be folders or files. All children of the designated " +
        "nodes will be searched. If not provided, all available files and folders will be searched."
    )
    .optional(),
});

export type SearchWithNodesInputType = z.infer<
  typeof SearchWithNodesInputSchema
>;

export type SearchInputTypeWithTags = SearchWithNodesInputType & TagsInputType;

function renderMimeType(mimeType: string) {
  return mimeType
    .replace("application/vnd.dust.", "")
    .replace("-", " ")
    .replace(".", " ");
}

function renderRelativeTimeFrame(relativeTimeFrame: TimeFrame | null): string {
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
  relativeTimeFrame,
  tagsIn,
  tagsNot,
  nodeIds,
}: SearchInputTypeWithTags): string {
  const timeFrameAsString = renderRelativeTimeFrame(
    parseTimeFrame(relativeTimeFrame)
  );
  const tagsAsString = renderTagsForToolOutput(tagsIn, tagsNot);
  const nodeIdsAsString = renderSearchNodeIds(nodeIds);

  return query
    ? `Searching "${query}" ${nodeIdsAsString}${timeFrameAsString}${tagsAsString}.`
    : `Searching ${timeFrameAsString}${tagsAsString}.`;
}

export const IncludeInputSchema = z
  .object({
    timeFrame: z
      .object({
        duration: z.number(),
        unit: z.enum(["hour", "day", "week", "month", "year"]),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type IncludeInputType = z.infer<typeof IncludeInputSchema>;

export function isIncludeInputType(
  input: Record<string, unknown>
): input is IncludeInputType {
  return (
    IncludeInputSchema.safeParse(input).success ||
    IncludeInputSchema.extend(TagsInputSchema.shape).safeParse(input).success
  );
}
export function makeQueryTextForInclude({
  timeFrame,
}: IncludeInputType): string {
  return `Requested to include documents ${renderRelativeTimeFrame(timeFrame ?? null)}`;
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

export type DataSourceFilesystemFindInputType = z.infer<
  typeof DataSourceFilesystemFindInputSchema
>;

export function isDataSourceFilesystemFindInputType(
  input: Record<string, unknown>
): input is DataSourceFilesystemFindInputType {
  return DataSourceFilesystemFindInputSchema.safeParse(input).success;
}

export function makeQueryTextForFind({
  query,
  rootNodeId,
  mimeTypes,
  nextPageCursor,
}: DataSourceFilesystemFindInputType): string {
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

export type DataSourceFilesystemListInputType = z.infer<
  typeof DataSourceFilesystemListInputSchema
>;

export function isDataSourceFilesystemListInputType(
  input: Record<string, unknown>
): input is DataSourceFilesystemListInputType {
  return DataSourceFilesystemListInputSchema.safeParse(input).success;
}

export function makeQueryTextForList({
  nodeId,
  mimeTypes,
  nextPageCursor,
}: DataSourceFilesystemListInputType): string {
  const location = nodeId ? ` within node "${nodeId}"` : " at the root level";
  const types = mimeTypes?.length
    ? ` (${mimeTypes.map(renderMimeType).join(", ")} files)`
    : "";
  const pagination = nextPageCursor ? " - next page" : "";

  return `Listing content${location}${types}${pagination}.`;
}
