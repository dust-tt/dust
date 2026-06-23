import type { CoreAPISearchTagsResponse } from "@app/types/core/core_api";
import { z } from "zod";

export const PostTagSearchBodySchema = z.object({
  query: z.string(),
  queryType: z.enum(["exact", "prefix", "match"]),
  dataSourceViewIds: z.array(z.string()),
});

export type PostTagSearchBody = z.infer<typeof PostTagSearchBodySchema>;

export type PostTagSearchResponseBody = CoreAPISearchTagsResponse;
