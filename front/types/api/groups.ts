import type { GroupType } from "@app/types/groups";

export type GroupAllowedActions = {
  canEditMembers: boolean;
  canEditDetails: boolean;
  canReadUsage: boolean;
  canSetUsageLimits: boolean;
  canAssignManagers: boolean;
};

export type GroupWithAllowedActions = GroupType & {
  allowedActions?: GroupAllowedActions;
};

export type GetGroupsResponseBody = {
  groups: GroupWithAllowedActions[];
};
