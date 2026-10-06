export type GroupLimit =
  | { kind: "unlimited" }
  | { kind: "limited"; awuCredits: number };

export type SetGroupLimitResponse = {
  limit: GroupLimit;
};

export type PutGroupLimitResponseBody = SetGroupLimitResponse;

export type GroupLimitUsage = {
  groupId: string;
  limitAwuCredits: number;
  usedAwuCredits: number;
};

export type GetGroupsUsageResponseBody = {
  groups: GroupLimitUsage[];
};
