import { ModelId } from "@app/lib/databases";

export type MembershipInvitationType = {
  id: ModelId;
  status: "pending" | "consumed" | "revoked";
  inviteEmail: string;
};
