import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";

export type GetUpgradeRequestsResponseBody = {
  requests: MembershipUpgradeRequestType[];
};

export type PostUpgradeRequestResponseBody = {
  request: MembershipUpgradeRequestType;
};

export type UpgradeRequestResolution =
  | { status: "denied" }
  | { status: "approved"; limit?: UserSpendLimit };

export type PatchUpgradeRequestResponseBody = {
  request: MembershipUpgradeRequestType;
};
