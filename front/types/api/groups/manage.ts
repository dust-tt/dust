import type { GroupType } from "@app/types/groups";
import { z } from "zod";

export const CreateGroupBodySchema = z.object({
  name: z.string().min(1),
  memberIds: z.array(z.string()).optional(),
});

export type CreateGroupBodyType = z.infer<typeof CreateGroupBodySchema>;

export type PostGroupResponseBody = {
  group: GroupType;
};
