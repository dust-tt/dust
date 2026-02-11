import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { SpaceType } from "@app/types/space";

export type GetBySpacesSummaryResponseBody = {
  summary: Array<{
    space: SpaceType;
    unreadConversations: ConversationWithoutContentType[];
    nonParticipantUnreadConversations: ConversationWithoutContentType[];
  }>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetBySpacesSummaryResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);

      // Fetch all unread conversations for the user in one query
      const { unreadConversations, nonParticipantUnreadConversations } =
        await ConversationResource.listSpaceUnreadConversationsForUser(
          auth,
          spaces.map((s) => s.id)
        );

      // Group conversations by space
      const spaceIdToSpaceMap = new Map(spaces.map((s) => [s.id, s]));

      const conversationsBySpace = new Map<
        number,
        {
          unreadConversations: ConversationWithoutContentType[];
          nonParticipantUnreadConversations: ConversationWithoutContentType[];
        }
      >();

      for (const conversation of unreadConversations) {
        // Only match conversations to spaces via spaceId
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
        // Only match conversations to spaces via spaceId
        if (conversation.spaceId) {
          const spaceModelId = conversation.space?.id;
          if (spaceModelId && spaceIdToSpaceMap.has(spaceModelId)) {
            const existing = conversationsBySpace.get(spaceModelId) ?? {
              unreadConversations: [],
              nonParticipantUnreadConversations: [],
            };
            existing.nonParticipantUnreadConversations.push(
              conversation.toJSON()
            );
            conversationsBySpace.set(spaceModelId, existing);
          }
        }
      }

      // Build response with all spaces (including those without unread conversations)
      const response: GetBySpacesSummaryResponseBody = {
        summary: spaces
          .filter(
            (space) =>
              space.kind === "project" || conversationsBySpace.has(space.id)
          )
          .map((space) => ({
            space: space.toJSON(),
            unreadConversations:
              conversationsBySpace.get(space.id)?.unreadConversations ?? [],
            nonParticipantUnreadConversations:
              conversationsBySpace.get(space.id)
                ?.nonParticipantUnreadConversations ?? [],
          })),
      };

      return res.status(200).json(response);

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
