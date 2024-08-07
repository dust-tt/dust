export const MEMBERSHIP_ROLE_TYPES = ["admin", "builder", "user"] as const;
export type MembershipRoleType = (typeof MEMBERSHIP_ROLE_TYPES)[number];
export function isMembershipRoleType(
  value: unknown
): value is MembershipRoleType {
  return MEMBERSHIP_ROLE_TYPES.includes(value as MembershipRoleType);
}

export type PublicListMembersResponseBody = {
  members: {
    id: string;
    email: string;
  }[];
};
