import type { LightUserType } from "@app/types/user";
import { UserSchema } from "@app/types/user";
import { z } from "zod";

export const PatchAgentEditorsRequestBodySchema = z
  .object({
    addEditorIds: z.array(z.string()).optional(),
    removeEditorIds: z.array(z.string()).optional(),
  })
  .refine(
    (body) =>
      (body.addEditorIds instanceof Array && body.addEditorIds.length > 0) ||
      (body.removeEditorIds instanceof Array &&
        body.removeEditorIds.length > 0),
    {
      message:
        "Either addEditorIds or removeEditorIds must be provided and contain at least one ID.",
    }
  );
export type PatchAgentEditorsRequestBody = z.infer<
  typeof PatchAgentEditorsRequestBodySchema
>;

export const AgentEditorsResponseBodySchema = z.object({
  editors: z.array(UserSchema),
});
export type AgentEditorsResponseBody = z.infer<
  typeof AgentEditorsResponseBodySchema
>;

export type AgentEditorsLightResponseBody = {
  editors: LightUserType[];
};
