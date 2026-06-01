import type { RegionType } from "@app/types/region";
import { z } from "zod";

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
  reminderSentAt: number | null;
  isExpired: boolean;
};

export type MembershipInvitationTypeWithLink = MembershipInvitationType & {
  inviteLink: string;
};

export interface PendingInvitationOption {
  token: string;
  workspaceName: string;
  initialRole: ActiveRoleType;
  createdAt: number;
  isExpired: boolean;
  region?: RegionType;
}

// Types for the invite form in Poke.

export const InviteMemberFormSchema = z.object({
  email: z.string().min(1),
  role: ActiveRoleSchema,
});

export type InviteMemberFormType = z.infer<typeof InviteMemberFormSchema>;
