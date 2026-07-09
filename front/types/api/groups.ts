import type { GroupType } from "@app/types/groups";

export type GetGroupsResponseBody = {
  groups: (GroupType & { poolCapAwuCredits: number | null })[];
};
