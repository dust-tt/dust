import type {
  MembershipInvitationType,
  PendingInvitationOption,
} from "@app/types/membership_invitation";
import { MEMBERSHIP_SEAT_TYPES } from "@app/types/memberships";
import { ActiveRoleSchema } from "@app/types/user";
import { z } from "zod";

export type GetWorkspaceInvitationsResponseBody = {
  invitations: MembershipInvitationType[];
};

export type GetPendingInvitationsLookupResponseBody = {
  pendingInvitations: PendingInvitationOption[];
};

export type GetPendingInvitationsResponseBody = {
  pendingInvitations: PendingInvitationOption[];
};

export const PostInvitationRequestBodySchema = z.array(
  z.object({
    email: z.string(),
    role: ActiveRoleSchema,
    seatType: z.enum(MEMBERSHIP_SEAT_TYPES).nullish(),
  })
);

export type PostInvitationRequestBody = z.infer<
  typeof PostInvitationRequestBodySchema
>;

export type PostInvitationResponseBody = {
  success: boolean;
  email: string;
  error_message?: string;
}[];

export type PostMemberInvitationsResponseBody = {
  invitation: MembershipInvitationType;
};

export const PostMemberInvitationBodySchema = z.object({
  status: z.enum(["revoked", "pending"]),
  initialRole: ActiveRoleSchema,
});
