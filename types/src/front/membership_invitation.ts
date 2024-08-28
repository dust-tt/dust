import * as t from "io-ts";
import { NonEmptyString } from "io-ts-types";

import { ModelId } from "../shared/model_id";
import { ActiveRoleSchema, ActiveRoleType } from "./user";

export type MembershipInvitationType = {
  sId: string;
  id: ModelId;
  status: "pending" | "consumed" | "revoked";
  inviteEmail: string;
  inviteLink: string;
  initialRole: ActiveRoleType;
  createdAt: number;
};

// Types for the invite form in Poke.

export const InviteMemberFormSchema = t.type({
  email: NonEmptyString,
  role: ActiveRoleSchema,
});

export type InviteMemberFormType = t.TypeOf<typeof InviteMemberFormSchema>;
