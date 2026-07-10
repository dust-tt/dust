import type { GroupType } from "@app/types/groups";
import type { UserType } from "@app/types/user";
import { z } from "zod";

export const CreateGroupBodySchema = z.object({
  name: z.string().min(1),
  memberIds: z.array(z.string()).min(1),
});

export type CreateGroupBodyType = z.infer<typeof CreateGroupBodySchema>;

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

export type PatchGroupBodyType = z.infer<typeof PatchGroupBodySchema>;

export type PatchGroupResponseBody = {
  group: GroupType;
  members: UserType[];
};

export type DeleteGroupResponseBody = {
  success: true;
};
