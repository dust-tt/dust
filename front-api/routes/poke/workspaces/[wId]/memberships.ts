import { getMembershipInvitationUrl } from "@app/lib/api/invitation";
import { getMembers } from "@app/lib/api/workspace";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import type { MembershipInvitationTypeWithLink } from "@app/types/membership_invitation";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PokeGetMemberships = {
  members: UserTypeWithWorkspaces[];
  pendingInvitations: MembershipInvitationTypeWithLink[];
};

// Mounted at /api/poke/workspaces/:wId/memberships.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<PokeGetMemberships> => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  const [{ members }, pendingInvitations] = await Promise.all([
    getMembers(auth),
    MembershipInvitationResource.getPendingInvitations(auth, {
      includeExpired: true,
    }),
  ]);

  return ctx.json({
    members,
    pendingInvitations: pendingInvitations.map((invite) => {
      const i = invite.toJSON();
      return {
        ...i,
        inviteLink: getMembershipInvitationUrl(owner, i),
      };
    }),
  });
});

export default app;
