import { z } from "zod";

export const PostMentionActionRequestBodySchema = z.object({
  type: z.enum(["agent", "user"]),
  id: z.string(),
  action: z.enum(["approved", "rejected", "dismissed"]),
});

export type PostMentionActionRequestBody = z.infer<
  typeof PostMentionActionRequestBodySchema
>;

export type PostMentionActionResponseBody = {
  success: boolean;
};
