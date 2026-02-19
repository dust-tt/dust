import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import z from "zod";

export const findTagsSchema = {
  query: z
    .string()
    .describe(
      "The text to search for in existing labels (also called tags) using edge ngram " +
        "matching (case-insensitive). Matches labels that start with any word in the " +
        "search text. The returned labels can be used in tagsIn/tagsNot parameters to " +
        "restrict or exclude content based on the user request and conversation context."
    ),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
};

export const FIND_TAGS_TOOL_NAME = "find_tags";

export const FIND_TAGS_BASE_DESCRIPTION =
  "Find exact matching labels (also called tags). " +
  "Restricting or excluding content succeeds only with existing labels. " +
  "Searching without verifying labels first typically returns no results. " +
  "The output of this tool can typically be used in `tagsIn` (if we want " +
  "to restrict the search to specific tags) or `tagsNot` (if we want to " +
  "exclude specific tags) parameters.";
