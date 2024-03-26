import { ModelId } from "../shared/model_id";
import { RoleType } from "./user";

export type MembershipInvitationType = {
  id: ModelId;
  status: "pending" | "consumed" | "revoked";
  inviteEmail: string;
  initialRole: Exclude<RoleType, "none">;
};
