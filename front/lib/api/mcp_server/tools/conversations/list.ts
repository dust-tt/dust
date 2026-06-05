import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";

const LIST_CONVERSATIONS_PAGE_SIZE = 25;
const LIST_CONVERSATIONS_ORDER_DIRECTION = "desc" as const;

const inputSchema = {
  podId: z
    .string()
    .optional()
    .describe(
      "Optional Pod id. When provided, lists conversations in that Pod instead of all user conversations."
    ),
  lastValue: z
    .string()
    .optional()
    .describe(
      "Cursor from a previous response's lastValue field for the next page."
    ),
  orderDirection: z
    .enum(["asc", "desc"])
    .optional()
    .describe(
      "Sort direction by updatedAt (default desc, most recently updated first)."
    ),
};

export function registerConversationsListTool(server: McpServer) {
  server.registerTool(
    "list_conversations",
    {
      description:
        "List conversations for the authenticated user in the current workspace (25 per page), sorted by most recently updated. Supports cursor pagination via lastValue. When podId is provided, lists conversations in that Pod instead.",
      inputSchema,
    },
    async ({ podId, lastValue, orderDirection }) => {
      const auth = getAuthenticatorFromMcpContext();

      const resolvedOrderDirection =
        orderDirection ?? LIST_CONVERSATIONS_ORDER_DIRECTION;

      if (podId) {
        const pod = await SpaceResource.fetchById(auth, podId);
        if (!pod || !pod.isProject() || !pod.canReadOrAdministrate(auth)) {
          return mcpError("Pod not found or you do not have access.");
        }

        const spaceConversations =
          await ConversationResource.listConversationsInSpace(auth, {
            spaceId: podId,
            options: { excludeTest: true },
          });

        const sortedConversations =
          resolvedOrderDirection === "asc"
            ? [...spaceConversations].reverse()
            : spaceConversations;

        let startIndex = 0;
        if (lastValue) {
          const cursorMs = Number.parseInt(lastValue, 10);
          if (!Number.isNaN(cursorMs)) {
            const cursorIndex = sortedConversations.findIndex(
              (conversation) => {
                const updated = conversation.toJSON().updated;
                return resolvedOrderDirection === "desc"
                  ? updated < cursorMs
                  : updated > cursorMs;
              }
            );
            startIndex =
              cursorIndex === -1 ? sortedConversations.length : cursorIndex;
          }
        }

        const pageConversations = sortedConversations.slice(
          startIndex,
          startIndex + LIST_CONVERSATIONS_PAGE_SIZE
        );
        const hasMore =
          startIndex + LIST_CONVERSATIONS_PAGE_SIZE <
          sortedConversations.length;
        const lastPageUpdated =
          pageConversations.length > 0
            ? pageConversations[pageConversations.length - 1].toJSON().updated
            : null;
        const nextLastValue =
          hasMore && lastPageUpdated !== null ? String(lastPageUpdated) : null;

        return mcpJsonResponse({
          conversations: pageConversations.map((conversation) =>
            conversation.toListItem()
          ),
          hasMore,
          lastValue: nextLastValue,
        });
      }

      const result =
        await ConversationResource.listPrivateConversationsForUserPaginatedFromDB(
          auth,
          {
            limit: LIST_CONVERSATIONS_PAGE_SIZE,
            lastValue,
            orderDirection: resolvedOrderDirection,
          }
        );

      return mcpJsonResponse({
        conversations: result.conversations,
        hasMore: result.hasMore,
        lastValue: result.lastValue,
      });
    }
  );
}
