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
        "previous search results. All children of the designated nodes will be searched. " +
        "If not provided, all available nodes will be searched."
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

export type TagsInputType = z.infer<typeof TagsInputSchema>;

export type SearchInputTypeWithTags = SearchWithNodesInputType & TagsInputType;

export function isSearchInputType(
  input: Record<string, unknown>
): input is SearchInputTypeWithTags {
  return (
    SearchWithNodesInputSchema.safeParse(input).success ||
    SearchWithNodesInputSchema.extend(TagsInputSchema.shape).safeParse(input)
      .success
  );
}

export const IncludeInputSchema = z.object({
  timeFrame:
    ConfigurableToolInputSchemas[
      INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME
    ].optional(),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
});

export type IncludeInputType = z.infer<typeof IncludeInputSchema>;

export function isIncludeInputType(
  input: Record<string, unknown>
): input is IncludeInputType {
  return (
    IncludeInputSchema.safeParse(input).success ||
    IncludeInputSchema.extend(TagsInputSchema.shape).safeParse(input).success
  );
}

export const WebsearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The query used to perform the Google search. If requested by the " +
        "user, use the Google syntax `site:` to restrict the search " +
        "to a particular website or domain."
    ),
});

export type WebsearchInputType = z.infer<typeof WebsearchInputSchema>;

export function isWebsearchInputType(
  input: Record<string, unknown>
): input is WebsearchInputType {
  return WebsearchInputSchema.safeParse(input).success;
}

export const WebbrowseInputSchema = z.object({
  urls: z.string().array().describe("List of urls to browse"),
  format: z
    .enum(["markdown", "html"])
    .optional()
    .describe("Format to return content: 'markdown' (default) or 'html'."),
  screenshotMode: z
    .enum(["none", "viewport", "fullPage"])
    .optional()
    .describe("Screenshot mode: 'none' (default), 'viewport', or 'fullPage'."),
  links: z
    .boolean()
    .optional()
    .describe("If true, also retrieve outgoing links from the page."),
});

export type WebbrowseInputType = z.infer<typeof WebbrowseInputSchema>;

export function isWebbrowseInputType(
  input: Record<string, unknown>
): input is WebbrowseInputType {
  return WebbrowseInputSchema.safeParse(input).success;
}

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

export type DataSourceFilesystemFindInputType = z.infer<
  typeof DataSourceFilesystemFindInputSchema
>;

export function isDataSourceFilesystemFindInputType(
  input: Record<string, unknown>
): input is DataSourceFilesystemFindInputType {
  return DataSourceFilesystemFindInputSchema.safeParse(input).success;
}

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

export type DataSourceFilesystemListInputType = z.infer<
  typeof DataSourceFilesystemListInputSchema
>;

export function isDataSourceFilesystemListInputType(
  input: Record<string, unknown>
): input is DataSourceFilesystemListInputType {
  return DataSourceFilesystemListInputSchema.safeParse(input).success;
}

export const DataSourceFilesystemLocateTreeInputSchema = z.object({
  nodeId: z.string().describe("The ID of the node to locate in the tree."),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
});

export type DataSourceFilesystemLocateTreeInputType = z.infer<
  typeof DataSourceFilesystemLocateTreeInputSchema
>;

export const SkillEnableInputSchema = z.object({
  skillName: z.string().describe("The name of the skill to enable"),
});

export type SkillEnableInputType = z.infer<typeof SkillEnableInputSchema>;

export function isSkillEnableInputType(
  input: Record<string, unknown>
): input is SkillEnableInputType {
  return SkillEnableInputSchema.safeParse(input).success;
}

export const GenerateImageInputSchema = z.object({
  prompt: z
    .string()
    .max(4000)
    .describe(
      "A text description of the desired image. The maximum length is 32000 characters."
    ),
  name: z
    .string()
    .max(64)
    .describe(
      "The filename that will be used to save the generated image. Must be 64 characters or less."
    ),
  quality: z
    .enum(["auto", "low", "medium", "high"])
    .optional()
    .default("auto")
    .describe(
      "The quality of the generated image. Must be one of auto, low, medium, or high. Auto" +
        " will automatically choose the best quality for the size."
    ),
  size: z
    .enum(["1024x1024", "1536x1024", "1024x1536"])
    .optional()
    .default("1024x1024")
    .describe(
      "The size of the generated image. Must be one of 1024x1024, 1536x1024, or 1024x1536"
    ),
});

export type GenerateImageInputType = z.infer<typeof GenerateImageInputSchema>;

export function isGenerateImageInputType(
  input: Record<string, unknown>
): input is GenerateImageInputType {
  return GenerateImageInputSchema.safeParse(input).success;
}

export const EditImageInputSchema = z.object({
  imageFileId: z
    .string()
    .describe(
      "The ID of the image file to edit (e.g. fil_abc1234) from conversation attachments. Must be a valid image file (PNG, JPEG, etc.)."
    ),
  editPrompt: z
    .string()
    .max(4000)
    .describe(
      "A text description of the desired edits. Be specific about what should change and what should remain unchanged. The maximum length is 4000 characters."
    ),
  outputName: z
    .string()
    .max(64)
    .describe(
      "The filename that will be used to save the edited image. Must be 64 characters or less."
    ),
  quality: z
    .enum(["auto", "low", "medium", "high"])
    .optional()
    .default("auto")
    .describe(
      "The quality of the edited image. Must be one of auto, low, medium, or high. Auto" +
        " will automatically choose the best quality."
    ),
  aspectRatio: z
    .enum(["1:1", "3:2", "2:3"])
    .optional()
    .describe(
      "Optional aspect ratio override for the edited image. If not specified, preserves the" +
        " original image's aspect ratio. Must be one of 1:1, 3:2, or 2:3."
    ),
});
export type EditImageInputType = z.infer<typeof EditImageInputSchema>;

export function isEditImageInputType(
  input: Record<string, unknown>
): input is EditImageInputType {
  return EditImageInputSchema.safeParse(input).success;
}
