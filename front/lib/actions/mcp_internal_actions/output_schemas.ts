import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

type ResourceWithName = {
  name: string;
};

export const isResourceWithName = (
  resource: object
): resource is ResourceWithName => {
  return "name" in resource && typeof resource.name === "string";
};

export const SearchQueryResourceSchema = z.object({
  mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_OUTPUT.SEARCH_QUERY),
  text: z.string(),
  uri: z.literal(""),
});

export type SearchQueryResourceType = z.infer<typeof SearchQueryResourceSchema>;

export const SearchResultResourceSchema = z.object({
  mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_OUTPUT.SEARCH_RESULT),
  uri: z.string(),
  text: z.string(),

  // Document metadata
  id: z.string(),
  tags: z.array(z.string()),
  ref: z.string(),
  chunks: z.array(z.string()),
  source: z.object({
    name: z.string(),
    provider: z.string().optional(),
  }),
});

export type SearchResultResourceType = z.infer<
  typeof SearchResultResourceSchema
>;

export const isSearchResultResourceType = (
  resource: object
): resource is SearchResultResourceType => {
  return (
    "mimeType" in resource &&
    resource.mimeType === INTERNAL_MIME_TYPES.TOOL_OUTPUT.SEARCH_RESULT &&
    SearchResultResourceSchema.safeParse(resource).success
  );
};
