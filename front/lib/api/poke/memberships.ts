import type { MembershipInvitationTypeWithLink } from "@app/types/membership_invitation";
import type { MembershipSeatType } from "@app/types/memberships";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import { z } from "zod";

/**
 * A workspace member as shown in the Poke members table. `seatType` is the
 * member's ACTIVE seat right now; when a future seat change is scheduled (e.g. a
 * member seated mid-migration whose seat flips at the pending contract start),
 * `scheduledSeatType` / `scheduledSeatChangeAt` describe that upcoming change so
 * the table can show "current → scheduled (date)" instead of surfacing the
 * not-yet-active seat as the current one.
 */
export type PokeWorkspaceMember = UserTypeWithWorkspaces & {
  scheduledSeatType?: MembershipSeatType | null;
  scheduledSeatChangeAt?: number | null;
};

export type PokeGetMemberships = {
  members: PokeWorkspaceMember[];
  pendingInvitations: MembershipInvitationTypeWithLink[];
};

export type PokeSearchWorkspaceMember = {
  sId: string;
  fullName: string | null;
  email: string;
};

export type PokeSearchWorkspaceMembers = {
  members: PokeSearchWorkspaceMember[];
  total: number;
};

export const pokeSearchWorkspaceMemberSchema = z.object({
  sId: z.string(),
  fullName: z.string().nullable(),
  email: z.string(),
});

export const pokeSearchWorkspaceMembersSchema = z.object({
  members: z.array(pokeSearchWorkspaceMemberSchema),
  total: z.number(),
});

export function parsePokeSearchWorkspaceMembers(
  data: unknown
): PokeSearchWorkspaceMembers {
  const result = pokeSearchWorkspaceMembersSchema.safeParse(data);
  if (!result.success) {
    throw new Error("Failed to parse workspace members response.");
  }
  return result.data;
}
