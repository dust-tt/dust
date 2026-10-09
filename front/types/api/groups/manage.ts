import type { GroupWithAllowedActions } from "@app/types/api/groups";
import type { GroupType } from "@app/types/groups";
import {
  GROUP_GRANTABLE_ROLES,
  GROUP_GRANTABLE_SEAT_TYPES,
} from "@app/types/groups";
import type { LightUserType } from "@app/types/user";
import { z } from "zod";

export const CreateGroupBodySchema = z.object({
  name: z.string().min(1),
  memberIds: z.array(z.string()).min(1),
  managerIds: z.array(z.string()).optional(),
});

export type PostGroupResponseBody = {
  group: GroupType;
};

export type GetGroupResponseBody = {
  group: GroupWithAllowedActions;
  members: LightUserType[];
  managers: LightUserType[];
};

/**
 * @cc [owner:philipperolet,label:api] disjoint-group-diff
 * A member or manager diff MUST reject any user ID present in both add and remove.
 */
const UserIdsDiffSchema = z
  .object({
    add: z.array(z.string()),
    remove: z.array(z.string()),
  })
  .refine(
    ({ add, remove }) => {
      const userIdsToRemove = new Set(remove);
      return add.every((userId) => !userIdsToRemove.has(userId));
    },
    { message: "A user cannot be added and removed in the same update." }
  );

export const PatchGroupBodySchema = z.union([
  z.strictObject({ name: z.string().min(1) }),
  z.strictObject({ memberDiff: UserIdsDiffSchema }),
  z.strictObject({ managerDiff: UserIdsDiffSchema }),
]);

export type PatchGroupBody = z.infer<typeof PatchGroupBodySchema>;

export type PatchGroupResponseBody = {
  group: GroupWithAllowedActions;
  members: LightUserType[];
  managers: LightUserType[];
};

export type DeleteGroupResponseBody = {
  success: true;
};

// `grantedRole: null` clears the group-to-role mapping.
export const PutGroupGrantedRoleBodySchema = z.object({
  grantedRole: z.enum(GROUP_GRANTABLE_ROLES).nullable(),
});

export type PutGroupGrantedRoleResponseBody = {
  group: GroupType;
};

// `grantedSeatType: null` clears the group-to-seat mapping.
export const PutGroupGrantedSeatTypeBodySchema = z.object({
  grantedSeatType: z.enum(GROUP_GRANTABLE_SEAT_TYPES).nullable(),
});

export type PutGroupGrantedSeatTypeResponseBody = {
  group: GroupType;
};

// Preview of mapping this group to a seat: the seat must be a real grantable
// type (not null — clearing has no cost to preview).
export const PostGroupGrantedSeatTypePreviewBodySchema = z.object({
  grantedSeatType: z.enum(GROUP_GRANTABLE_SEAT_TYPES),
});

export type GetMemberGroupsResponseBody = {
  groups: GroupType[];
};

export const PostMemberGroupBodySchema = z.object({
  groupId: z.string(),
});

export type PostMemberGroupResponseBody = {
  group: GroupType;
};

export type DeleteMemberGroupResponseBody = {
  success: true;
};
