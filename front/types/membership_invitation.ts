import * as t from "io-ts";
import { NonEmptyString } from "io-ts-types";

import type { ModelId } from "./shared/model_id";
import type { ActiveRoleType } from "./user";
import { ActiveRoleSchema } from "./user";

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
  email: NonEmptyString,
  role: ActiveRoleSchema,
});

export type InviteMemberFormType = t.TypeOf<typeof InviteMemberFormSchema>;
