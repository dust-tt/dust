import type { LightUserType, UserType } from "@app/types/user";
import { z } from "zod";

export const PatchSkillEditorsRequestBodySchema = z
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

export type PatchSkillEditorsRequestBody = z.infer<
  typeof PatchSkillEditorsRequestBodySchema
>;

export interface SkillEditorsResponseBody {
  editors: UserType[];
}

export interface SkillEditorsLightResponseBody {
  editors: LightUserType[];
}
