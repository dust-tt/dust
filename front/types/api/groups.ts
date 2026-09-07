import type { GroupTypeWithOptionalPoolCap } from "@app/types/groups";

export type GetGroupsResponseBody = {
  groups: GroupTypeWithOptionalPoolCap[];
};
