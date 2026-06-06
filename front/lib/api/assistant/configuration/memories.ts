// Contract types and schemas for the agent memories API endpoints.
//
// These are the request/response body schemas shared between the Next.js
// handlers under `front/pages/api/.../memories` and their Hono counterparts
// under `front-api/routes/.../memories`.
import { z } from "zod";

export const GetAgentMemoriesResponseBodySchema = z.object({
  memories: z.array(
    z.object({
      sId: z.string(),
      lastUpdated: z.date(),
      content: z.string(),
    })
  ),
});
export type GetAgentMemoriesResponseBody = z.infer<
  typeof GetAgentMemoriesResponseBodySchema
>;

export const PatchAgentMemoryRequestBodySchema = z.object({
  content: z.string(),
});
export type PatchAgentMemoryRequestBody = z.infer<
  typeof PatchAgentMemoryRequestBodySchema
>;

export const PatchAgentMemoryResponseBodySchema = z.object({
  memory: z.object({
    sId: z.string(),
    lastUpdated: z.date(),
    content: z.string(),
  }),
});
export type PatchAgentMemoryResponseBody = z.infer<
  typeof PatchAgentMemoryResponseBodySchema
>;
