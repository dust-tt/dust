import { ModelId } from "../shared/model_id";
import { ActiveRoleType } from "./user";

export type MembershipInvitationType = {
  id: ModelId;
  status: "pending" | "consumed" | "revoked";
  inviteEmail: string;
  initialRole: ActiveRoleType;
};
