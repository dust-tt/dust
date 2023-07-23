import { ModelId } from "@app/lib/models";

export type MembershipInvitationType = {
  id: ModelId;
  status: "pending" | "consumed" | "revoked";
  inviteEmail: string;
};
