import type { MembershipUpgradeRequestType } from "@app/types/memberships";

export type GetUpgradeRequestsResponseBody = {
  requests: MembershipUpgradeRequestType[];
};

export type PostUpgradeRequestResponseBody = {
  request: MembershipUpgradeRequestType;
};

export type PatchUpgradeRequestResponseBody = {
  request: MembershipUpgradeRequestType;
};
