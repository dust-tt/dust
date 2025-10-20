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

export type SearchInputType = z.infer<typeof SearchInputSchema>;

export function isSearchInputType(
  input: Record<string, unknown>
): input is SearchInputType {
  return (
    SearchInputSchema.safeParse(input).success ||
    SearchInputSchema.extend(TagsInputSchema.shape).safeParse(input).success
  );
}

export const TagsInputSchema = z.object({
  tagsIn: z
    .array(z.string())
    .describe(
      "A list of labels (also called tags) to restrict the search based on the user request and past conversation context." +
        "If multiple labels are provided, the search will return documents that have at least one of the labels." +
        "You can't check that all labels are present, only that at least one is present." +
        "If no labels are provided, the search will return all documents regardless of their labels."
    ),
  tagsNot: z
    .array(z.string())
    .describe(
      "A list of labels (also called tags) to exclude from the search based on the user request and past conversation context." +
        "Any document having one of these labels will be excluded from the search."
    ),
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

export type WebsearchInputType = z.infer<typeof WebsearchInputSchema>;

export function isWebsearchInputType(
  input: Record<string, unknown>
): input is WebsearchInputType {
  return WebsearchInputSchema.safeParse(input).success;
}
