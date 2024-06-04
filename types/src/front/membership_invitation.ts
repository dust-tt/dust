import * as t from "io-ts";

import { ModelId } from "../shared/model_id";
import { ActiveRoleSchema, ActiveRoleType } from "./user";

export type MembershipInvitationType = {
  sId: string;
  id: ModelId;
  status: "pending" | "consumed" | "revoked";
  inviteEmail: string;
  initialRole: ActiveRoleType;
  createdAt: number;
};

// Types for the invite form in Poke.

export const InviteMemberFormSchema = t.type({
  email: t.string,
  role: ActiveRoleSchema,
});

export type InviteMemberFormType = t.TypeOf<typeof InviteMemberFormSchema>;
