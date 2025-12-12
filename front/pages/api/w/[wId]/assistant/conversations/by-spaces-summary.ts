import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  ConversationWithoutContentType,
  SpaceType,
  WithAPIErrorResponse,
} from "@app/types";

export type GetBySpacesSummaryResponseBody = {
  summary: Array<{
    space: SpaceType;
    unreadConversations: ConversationWithoutContentType[];
  }>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetBySpacesSummaryResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const workspace = auth.getNonNullableWorkspace();

      // Filter out non-regular groups as we only want to allow conversations in regular spaces (that are linked to regular groups)
      const allGroups = auth
        .groups()
        .filter((g) => g.kind === "regular" && g.workspaceId === workspace.id);

      const spaces = await SpaceResource.listForGroups(auth, allGroups);

      // Fetch all unread conversations for the user in one query
      const unreadConversations =
        await ConversationResource.listConversationsForUser(auth, {
          onlyUnread: true,
          kind: "space",
        });

      // Group conversations by space
      const spaceIdToSpaceMap = new Map(spaces.map((s) => [s.id, s]));

      const conversationsBySpace = new Map<
        number,
        ConversationWithoutContentType[]
      >();

      for (const conversation of unreadConversations) {
        // Only match conversations to spaces via spaceId
        if (conversation.spaceId) {
          const spaceModelId = conversation.space?.id;
          if (spaceModelId && spaceIdToSpaceMap.has(spaceModelId)) {
            const existing = conversationsBySpace.get(spaceModelId) ?? [];
            existing.push(conversation.toJSON());
            conversationsBySpace.set(spaceModelId, existing);
          }
        }
      }

      // Build response with all spaces (including those without unread conversations)
      const response: GetBySpacesSummaryResponseBody = {
        summary: spaces.map((space) => ({
          space: space.toJSON(),
          unreadConversations: (conversationsBySpace.get(space.id) ?? []).sort(
            (a, b) => b.updated - a.updated
          ), // Sort by updated time descending
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
