import { z } from "zod";

export type PostAgentUserFavoriteResponseBody = {
  agentId: string;
  userFavorite: boolean;
};

export const PostAgentUserFavoriteRequestBodySchema = z.object({
  agentId: z.string(),
  userFavorite: z.boolean(),
});

export type PostAgentUserFavoriteRequestBody = z.infer<
  typeof PostAgentUserFavoriteRequestBodySchema
>;
