import type {
  PokeGetMemberships,
  PokeSearchWorkspaceMembers,
} from "@app/lib/api/poke/memberships";
import { getMembers } from "@app/lib/api/workspace";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { getMembershipInvitationUrl } from "@app/lib/utils/invitation_token";
import type { MembershipSeatType } from "@app/types/memberships";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const SearchMembersQuerySchema = z.object({
  q: z.string().optional().default(""),
  limit: z.coerce.number().int().min(1).max(50).optional().default(25),
});

function formatMemberSearchResults(
  members: { sId: string; fullName: string | null; email: string }[]
): PokeSearchWorkspaceMembers["members"] {
  return members.map((member) => ({
    sId: member.sId,
    fullName: member.fullName,
    email: member.email,
  }));
}

function filterMembersByQuery(
  members: { sId: string; fullName: string | null; email: string }[],
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return members;
  }

  return members.filter((member) => {
    const haystack = `${member.fullName ?? ""} ${member.email}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

// Mounted at /api/poke/workspaces/:wId/memberships.
const app = pokeApp();

/** @ignoreswagger */
// Poke-only member search for plugin comboboxes (name/email prefix via Elasticsearch).
app.get("/search", validate("query", SearchMembersQuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { q, limit } = ctx.req.valid("query");

  const searchResult = await UserResource.searchUsers(auth, {
    searchTerm: q,
    offset: 0,
    limit,
    orderBy: q.trim()
      ? undefined
      : {
          field: "name",
          direction: "asc",
        },
  });

  if (searchResult.isOk()) {
    return ctx.json({
      members: formatMemberSearchResults(
        searchResult.value.users.map((user) => {
          const json = user.toJSON();
          return {
            sId: json.sId,
            fullName: json.fullName,
            email: json.email,
          };
        })
      ),
      total: searchResult.value.total,
    } satisfies PokeSearchWorkspaceMembers);
  }

  const { members } = await getMembers(auth, { activeOnly: true });
  const filteredMembers = filterMembersByQuery(members, q).slice(0, limit);

  return ctx.json({
    members: formatMemberSearchResults(filteredMembers),
    total: filteredMembers.length,
  } satisfies PokeSearchWorkspaceMembers);
});

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeGetMemberships> => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  // Members list includes revoked memberships (role "none"), each shown by
  // their ACTIVE seat. Scheduled future seat changes (e.g. a member seated
  // mid-migration whose seat flips at the pending contract start) live in
  // separate future-dated rows — surface them separately so the table shows
  // "current → scheduled (date)" rather than the not-yet-active seat.
  const [{ members }, scheduledFutureMemberships, pendingInvitations] =
    await Promise.all([
      getMembers(auth),
      MembershipResource.getScheduledFutureMemberships({ workspace: owner }),
      MembershipInvitationResource.getPendingInvitations(auth, {
        includeExpired: true,
      }),
    ]);

  // Keep the soonest scheduled change per member.
  const scheduledByUserId = new Map<
    string,
    { seatType: MembershipSeatType; at: number }
  >();
  for (const m of scheduledFutureMemberships) {
    const userId = m.user?.sId;
    if (!userId) {
      continue;
    }
    const at = m.startAt.getTime();
    const existing = scheduledByUserId.get(userId);
    if (!existing || at < existing.at) {
      scheduledByUserId.set(userId, { seatType: m.seatType, at });
    }
  }

  return ctx.json({
    members: members.map((m) => {
      const scheduled = scheduledByUserId.get(m.sId);
      return {
        ...m,
        scheduledSeatType: scheduled?.seatType ?? null,
        scheduledSeatChangeAt: scheduled?.at ?? null,
      };
    }),
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
