import type { GroupType } from "@app/types/groups";
import type { UserType } from "@app/types/user";

export type SharedUsageLimit =
  | { kind: "unlimited" }
  | { kind: "limited"; awuCredits: number };

export type SetSharedUsageLimitResponse = {
  limit: SharedUsageLimit;
};

export type PutSharedUsageLimitResponseBody = SetSharedUsageLimitResponse;

export type SharedUsageLimitWithUsage = {
  groupId: string;
  limitAwuCredits: number;
  usedAwuCredits: number;
};

export type GetGroupsUsageResponseBody = {
  groups: SharedUsageLimitWithUsage[];
};

export type GetSharedUsageLimitPreviewResponseBody = {
  usedAwuCredits: number;
  blocksDrawingMembers: boolean;
  membersDrawingElsewhere: { user: UserType; group: GroupType }[];
  membersDrawingElsewhereCount: number;
};
