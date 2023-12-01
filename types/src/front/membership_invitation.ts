import { ModelId } from "../shared/model_id";

export type MembershipInvitationType = {
  id: ModelId;
  status: "pending" | "consumed" | "revoked";
  inviteEmail: string;
};
