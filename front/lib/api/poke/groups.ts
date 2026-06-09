import type { GroupType } from "@app/types/groups";
import type { UserTypeWithWorkspaces } from "@app/types/user";

export type PokeListGroups = {
  groups: GroupType[];
};

export type PokeGetGroupDetails = {
  members: UserTypeWithWorkspaces[];
  group: GroupType;
};
