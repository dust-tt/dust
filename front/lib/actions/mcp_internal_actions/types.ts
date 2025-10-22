import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";

export const SearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The string used to retrieve relevant chunks of information using semantic similarity" +
        " based on the user request and conversation context." +
        " Include as much semantic signal based on the entire conversation history," +
        " paraphrasing if necessary. longer queries are generally better."
    ),
  relativeTimeFrame: z
    .string()
    .regex(/^(all|\d+[hdwmy])$/)
    .describe(
      "The time frame (relative to LOCAL_TIME) to restrict the search based" +
        " on the user request and past conversation context." +
        " Possible values are: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y`" +
        " where {k} is a number. Be strict, do not invent invalid values."
    ),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
});

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

export const IncludeInputSchema = z.object({
  timeFrame:
    ConfigurableToolInputSchemas[
      INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME
    ].optional(),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
});

export const WebsearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The query used to perform the Google search. If requested by the " +
        "user, use the Google syntax `site:` to restrict the search " +
        "to a particular website or domain."
    ),
  page: z
    .number()
    .optional()
    .describe(
      "A 1-indexed page number used to paginate through the search results." +
        " Should only be provided if the page is strictly greater than 1 in order" +
        " to go deeper into the search results for a specific query."
    ),
});

export const DataSourceFilesystemFindInputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "The title to search for. This supports partial matching and does not require the " +
        "exact title. For example, searching for 'budget' will find 'Budget 2024.xlsx', " +
        "'Q1 Budget Report', etc..."
    ),
  rootNodeId: z
    .string()
    .optional()
    .describe(
      "The node ID of the node to start the search from. If not provided, the search will " +
        "start from the root of the filesystem. This ID can be found from previous search " +
        "results in the 'nodeId' field. This parameter restricts the search to the children " +
        "and descendant of a specific node. If a node output by this tool or the list tool" +
        "has children (hasChildren: true), it means that it can be passed as a rootNodeId."
    ),
  mimeTypes: z
    .array(z.string())
    .optional()
    .describe(
      "The mime types to search for. If provided, only nodes with one of these mime types " +
        "will be returned. If not provided, no filter will be applied. The mime types passed " +
        "here must be one of the mime types found in the 'mimeType' field."
    ),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
  limit: z
    .number()
    .optional()
    .describe(
      "Maximum number of results to return. Initial searches should use 10-20."
    ),
  nextPageCursor: z
    .string()
    .optional()
    .describe(
      "Cursor for fetching the next page of results. This parameter should only be used to fetch " +
        "the next page of a previous search. The value should be exactly the 'nextPageCursor' from " +
        "the previous search result."
    ),
});

export const DataSourceFilesystemListInputSchema = z.object({
  nodeId: z
    .string()
    .nullable()
    .describe(
      "The exact ID of the node to list the contents of. " +
        "This ID can be found from previous search results in the 'nodeId' field. " +
        "If not provided, the content at the root of the filesystem will be shown."
    ),
  mimeTypes: z
    .array(z.string())
    .optional()
    .describe(
      "The mime types to search for. If provided, only nodes with one of these mime types " +
        "will be returned. If not provided, no filter will be applied. The mime types passed " +
        "here must be one of the mime types found in the 'mimeType' field."
    ),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
  sortBy: z
    .enum(["title", "timestamp"])
    .optional()
    .describe(
      "Field to sort the results by. 'title' sorts alphabetically A-Z, 'timestamp' sorts by " +
        "most recent first. If not specified, results are returned in the default order, which is " +
        "folders first, then both documents and tables and alphabetically by title."
    ),
  limit: z
    .number()
    .optional()
    .describe(
      "Maximum number of results to return. Initial searches should use 10-20."
    ),
  nextPageCursor: z
    .string()
    .optional()
    .describe(
      "Cursor for fetching the next page of results. This parameter should only be used to fetch " +
        "the next page of a previous search. The value should be exactly the 'nextPageCursor' from " +
        "the previous search result."
    ),
});
