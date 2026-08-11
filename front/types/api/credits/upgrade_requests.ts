import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import type {
  MembershipSeatType,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";

export type GetUpgradeRequestsResponseBody = {
  requests: MembershipUpgradeRequestType[];
  // Total resolved-request count, for the history view's pagination. Absent
  // for the (unpaginated) pending-requests list.
  total?: number;
};

export type PostUpgradeRequestResponseBody = {
  request: MembershipUpgradeRequestType;
};

export type UpgradeRequestResolution =
  | { status: "denied" }
  | {
      status: "approved";
      limit?: UserSpendLimit;
      // Set when the admin resolved the request via "Upgrade to max plan".
      grantedSeatType?: MembershipSeatType;
    };

export type PatchUpgradeRequestResponseBody = {
  request: MembershipUpgradeRequestType;
};
