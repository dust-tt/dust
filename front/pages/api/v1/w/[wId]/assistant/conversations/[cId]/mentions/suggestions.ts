import type { GetMentionSuggestionsResponseBodyType } from "@dust-tt/client";
import { GetMentionSuggestionsRequestQuerySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { suggestionsOfMentions } from "@app/lib/api/assistant/conversation/mention_suggestions";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/mentions/suggestions:
 *   get:
 *     summary: Get mention suggestions for a conversation
 *     description: Get suggestions for mentions (agents and users) based on a query string, scoped to a specific conversation.
 *     tags:
 *       - Mentions
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *       - in: query
 *         name: query
 *         required: true
 *         description: Search query string to filter suggestions
 *         schema:
 *           type: string
 *       - in: query
 *         name: select
 *         required: false
 *         description: Array of mention types to include. Can be "agents", "users", or both. If not provided, defaults to agents and users.
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             enum:
 *               - agents
 *               - users
 *       - in: query
 *         name: current
 *         required: false
 *         description: Whether to include the current user in the suggestions.
 *         schema:
 *           type: boolean
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of mention suggestions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RichMention'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Conversation not found.
 *       405:
 *         description: Method not supported. Only GET is expected.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetMentionSuggestionsResponseBodyType>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationId = req.query.cId;

  const conversationRes = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversationRes) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found",
      },
    });
  }

  const parsedQuery = GetMentionSuggestionsRequestQuerySchema.parse(req.query);
  const { query, select: selectParam, current } = parsedQuery;

  // Parse select parameter: can be "agents", "users", ["agents", "users"], or undefined.
  const select = (() => {
    if (!selectParam) {
      return { agents: true, users: true };
    }

    if (typeof selectParam === "string") {
      return {
        agents: selectParam === "agents",
        users: selectParam === "users",
      };
    }

    const agents = selectParam.includes("agents");
    const users = selectParam.includes("users");

    return { agents, users };
  })();

  const suggestions = await suggestionsOfMentions(auth, {
    query,
    select,
    current,
  });

  return res.status(200).json({ suggestions });
}

export default withPublicAPIAuthentication(handler);
