import type { MembershipInvitationTypeWithLink } from "@app/types/membership_invitation";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import { z } from "zod";

export type PokeGetMemberships = {
  members: UserTypeWithWorkspaces[];
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
