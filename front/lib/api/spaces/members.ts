import { z } from "zod";

// The space's whole desired membership. Every dimension is optional, and one the request leaves
// out is emptied, not kept: omitting `groupIds` says no group has access, the same as sending an
// empty array.
export const PatchSpaceMembersRequestBodySchema = z.object({
  isRestricted: z.boolean(),
  // Optional: this endpoint never renames a space (PATCH on the space itself does). Omitted by
  // surfaces with no editable name.
  name: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
  editorIds: z.array(z.string()).optional(),
  groupIds: z.array(z.string()).optional(),
  editorGroupIds: z.array(z.string()).optional(),
});

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
