import type { GroupType } from "@app/types/groups";
import type { UserType } from "@app/types/user";

export type GroupAllowedActions = {
  canEditMembers: boolean;
  canEditDetails: boolean;
  canReadUsage: boolean;
  canSetUsageLimits: boolean;
  canAssignManagers: boolean;
};

export type GroupWithAllowedActions = GroupType & {
  allowedActions?: GroupAllowedActions;
  managers?: Pick<UserType, "sId" | "fullName" | "image">[];
};

export type GetGroupsResponseBody = {
  groups: GroupWithAllowedActions[];
};
