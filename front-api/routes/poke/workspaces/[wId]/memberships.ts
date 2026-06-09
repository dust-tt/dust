import type { PokeGetMemberships } from "@app/lib/api/poke/memberships";
import { getMembers } from "@app/lib/api/workspace";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { getMembershipInvitationUrl } from "@app/lib/utils/invitation_token";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/memberships.
const app = pokeApp();

/** @ignoreswagger */
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
