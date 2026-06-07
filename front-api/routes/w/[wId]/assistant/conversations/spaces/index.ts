import type { GetBySpacesSummaryResponseBody } from "@app/lib/api/assistant/conversation/spaces";
import { listNonArchivedMemberSpacesWithMetadata } from "@app/lib/api/projects/list";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import spaceId from "./[spaceId]";

export type { GetBySpacesSummaryResponseBody };

export function sortSpacesSummary<T extends { id: number }>(
  spaces: T[],
  conversationsBySpace: Map<number, { unreadConversations: unknown[] }>,
  lastUserActivityBySpace: Map<number, Date>
): T[] {
  return [...spaces].sort((a, b) => {
    const aHasUnread =
      (conversationsBySpace.get(a.id)?.unreadConversations.length ?? 0) > 0;
    const bHasUnread =
      (conversationsBySpace.get(b.id)?.unreadConversations.length ?? 0) > 0;
    if (aHasUnread !== bHasUnread) {
      return aHasUnread ? -1 : 1;
    }
    const aActivity = lastUserActivityBySpace.get(a.id)?.getTime() ?? 0;
    const bActivity = lastUserActivityBySpace.get(b.id)?.getTime() ?? 0;
    return bActivity - aActivity;
  });
}

// Mounted under /api/w/:wId/assistant/conversations/spaces.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetBySpacesSummaryResponseBody> => {
  const auth = ctx.get("auth");

  const { nonArchivedSpaces, metadataMap } =
    await listNonArchivedMemberSpacesWithMetadata(auth);

  // Fetch all unread conversations for the user in one query.
  const {
    unreadConversations,
    nonParticipantUnreadConversations,
    lastUserActivityBySpace,
  } = await ConversationResource.listSpaceUnreadConversationsAndActivityForUser(
    auth,
    nonArchivedSpaces.map((s) => s.id)
  );

  const starredSpaceModelIds =
    await UserProjectPreferencesResource.fetchStarred(auth, {
      spaceIds: nonArchivedSpaces.map((s) => s.id),
    });

  // Group conversations by space.
  const spaceIdToSpaceMap = new Map(nonArchivedSpaces.map((s) => [s.id, s]));

  const conversationsBySpace = new Map<
    number,
    {
      unreadConversations: ConversationWithoutContentType[];
      nonParticipantUnreadConversations: ConversationWithoutContentType[];
    }
  >();

  for (const conversation of unreadConversations) {
    if (conversation.spaceId) {
      const spaceModelId = conversation.space?.id;
      if (spaceModelId && spaceIdToSpaceMap.has(spaceModelId)) {
        const existing = conversationsBySpace.get(spaceModelId) ?? {
          unreadConversations: [],
          nonParticipantUnreadConversations: [],
        };
        existing.unreadConversations.push(conversation.toJSON());
        conversationsBySpace.set(spaceModelId, existing);
      }
    }
  }

  for (const conversation of nonParticipantUnreadConversations) {
    if (conversation.spaceId) {
      const spaceModelId = conversation.space?.id;
      if (spaceModelId && spaceIdToSpaceMap.has(spaceModelId)) {
        const existing = conversationsBySpace.get(spaceModelId) ?? {
          unreadConversations: [],
          nonParticipantUnreadConversations: [],
        };
        existing.nonParticipantUnreadConversations.push(conversation.toJSON());
        conversationsBySpace.set(spaceModelId, existing);
      }
    }
  }

  // Build response with all spaces (including those without unread conversations).
  const filteredSpaces = nonArchivedSpaces.filter(
    (space) => space.kind === "project" || conversationsBySpace.has(space.id)
  );
  return ctx.json({
    summary: sortSpacesSummary(
      filteredSpaces,
      conversationsBySpace,
      lastUserActivityBySpace
    ).map((space) => ({
      space: {
        ...space.toJSON(),
        description: metadataMap.get(space.id)?.description ?? null,
        // We excluded archived projects and we only list projects where the user is a member.
        archivedAt: null,
        isMember: true,
        isEditor: space.canAdministrate(auth),
        isStarred: starredSpaceModelIds.has(space.id),
      },
      unreadConversations:
        conversationsBySpace.get(space.id)?.unreadConversations ?? [],
      nonParticipantUnreadConversations:
        conversationsBySpace.get(space.id)?.nonParticipantUnreadConversations ??
        [],
    })),
  });
});

app.route("/:spaceId", spaceId);

export default app;
