import type { GroupType } from "@app/types/groups";
import {
  GROUP_GRANTABLE_ROLES,
  GROUP_GRANTABLE_SEAT_TYPES,
} from "@app/types/groups";
import type { UserType } from "@app/types/user";
import { z } from "zod";

export const CreateGroupBodySchema = z.object({
  name: z.string().min(1),
  memberIds: z.array(z.string()).min(1),
});

export type PostGroupResponseBody = {
  group: GroupType;
};

export type GetGroupResponseBody = {
  group: GroupType;
  members: UserType[];
};

export const PatchGroupBodySchema = z.object({
  name: z.string().min(1).optional(),
  memberIds: z.array(z.string()).optional(),
});

export type PatchGroupResponseBody = {
  group: GroupType;
  members: UserType[];
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
