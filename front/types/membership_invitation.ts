export type MembershipInvitationType = {
  id: number;
  status: "pending" | "consumed" | "revoked";
  inviteEmail: string;
};