import type { RegionType } from "@app/types/region";

import type { MembershipSeatType } from "./memberships";
import type { ModelId } from "./shared/model_id";
import type { ActiveRoleType } from "./user";

export type MembershipInvitationType = {
  sId: string;
  id: ModelId;
  status: "pending" | "consumed" | "revoked";
  inviteEmail: string;
  initialRole: ActiveRoleType;
  createdAt: number;
  reminderSentAt: number | null;
  expiresAt: number;
  isExpired: boolean;
  seatType: MembershipSeatType | null;
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

export const MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY = 300;
