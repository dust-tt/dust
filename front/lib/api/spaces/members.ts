import { z } from "zod";

export const PatchSpaceMembersRequestBodySchema = z.intersection(
  z.object({
    isRestricted: z.boolean(),
    name: z.string(),
  }),
  z.discriminatedUnion("managementMode", [
    z.object({
      memberIds: z.array(z.string()),
      managementMode: z.literal("manual"),
      editorIds: z.array(z.string()),
    }),
    z.object({
      groupIds: z.array(z.string()),
      managementMode: z.literal("group"),
      editorGroupIds: z.array(z.string()),
    }),
  ])
);

export type PatchSpaceMembersRequestBodyType = z.infer<
  typeof PatchSpaceMembersRequestBodySchema
>;
