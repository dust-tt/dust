import type { MembershipInvitationTypeWithLink } from "@app/types/membership_invitation";
import type { UserTypeWithWorkspaces } from "@app/types/user";

export type PokeGetMemberships = {
  members: UserTypeWithWorkspaces[];
  pendingInvitations: MembershipInvitationTypeWithLink[];
};
