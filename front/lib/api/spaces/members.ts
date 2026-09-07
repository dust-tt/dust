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

// Unlike PATCH, which has to carry the full member list, POST only adds users and is bounded.
export const MAX_SPACE_MEMBERS_PER_ADD = 100;

export const PostSpaceMembersRequestBodySchema = z.object({
  memberIds: z.array(z.string()).min(1).max(MAX_SPACE_MEMBERS_PER_ADD),
});

export type PostSpaceMembersRequestBodyType = z.infer<
  typeof PostSpaceMembersRequestBodySchema
>;
