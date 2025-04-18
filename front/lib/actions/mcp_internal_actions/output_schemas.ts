import { z } from "zod";

type ResourceWithName = {
  name: string;
};

export const isResourceWithName = (
  resource: object
): resource is ResourceWithName => {
  return "name" in resource && typeof resource.name === "string";
};

export const SearchQueryResourceMimeType = "application/vnd.dust.search_query";

export const SearchQueryResourceSchema = z.object({
  mimeType: z.literal(SearchQueryResourceMimeType),
  text: z.string(),
  uri: z.literal(""),
});

export type SearchQueryResourceType = z.infer<typeof SearchQueryResourceSchema>;

export const SearchResultResourceMimeType =
  "application/vnd.dust.search_result";

export const SearchResultResourceSchema = z.object({
  mimeType: z.literal(SearchResultResourceMimeType),
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
    resource.mimeType === SearchResultResourceMimeType &&
    SearchResultResourceSchema.safeParse(resource).success
  );
};
