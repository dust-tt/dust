export const MEMBERSHIP_ROLE_TYPES = ["admin", "builder", "user"] as const;

export type MembershipRoleType = (typeof MEMBERSHIP_ROLE_TYPES)[number];

export function isMembershipRoleType(
  value: unknown
): value is MembershipRoleType {
  return MEMBERSHIP_ROLE_TYPES.includes(value as MembershipRoleType);
}

const MEMBERSHIP_ORIGIN_TYPES = [
  "provisioned",
  "invited",
  "auto-joined",
] as const;

export type MembershipOriginType = (typeof MEMBERSHIP_ORIGIN_TYPES)[number];

function isMembershipOriginType(value: unknown): value is MembershipOriginType {
  return MEMBERSHIP_ORIGIN_TYPES.includes(value as MembershipOriginType);
}
