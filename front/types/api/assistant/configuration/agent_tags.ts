import { TagSchema } from "@app/types/tag";
import { z } from "zod";

export const PatchAgentTagsRequestBodySchema = z
  .object({
    addTagIds: z.array(z.string()).optional(),
    removeTagIds: z.array(z.string()).optional(),
  })
  .refine(
    (body) =>
      (body.addTagIds?.length ?? 0) > 0 || (body.removeTagIds?.length ?? 0) > 0,
    {
      message:
        "Either addTagIds or removeTagIds must be provided and contain at least one ID.",
    }
  );

export type PatchAgentTagsRequestBody = z.infer<
  typeof PatchAgentTagsRequestBodySchema
>;

export const PatchAgentTagsResponseBodySchema = z.object({
  tags: z.array(TagSchema),
});

export type PatchAgentTagsResponseBody = z.infer<
  typeof PatchAgentTagsResponseBodySchema
>;
