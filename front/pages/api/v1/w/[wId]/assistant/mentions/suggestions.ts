import type { GetMentionSuggestionsResponseBodyType } from "@dust-tt/client";
import { GetMentionSuggestionsRequestQuerySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { suggestionsOfMentions } from "@app/lib/api/assistant/conversation/mention_suggestions";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/mentions/suggestions:
 *   get:
 *     summary: Get mention suggestions
 *     description: Get suggestions for mentions (agents and users) based on a query string.
 *     tags:
 *       - Mentions
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
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
 *         description: Array of mention types to include. Can be "agents", "users", or both. If not provided, defaults to agents (and users if mentions_v2 is enabled).
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             enum:
 *               - agents
 *               - users
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

  const parsedQuery = GetMentionSuggestionsRequestQuerySchema.parse(req.query);
  const { query, select: selectParam } = parsedQuery;

  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  const mentions_v2_enabled = featureFlags.includes("mentions_v2");

  // Parse select parameter: can be "agents", "users", ["agents", "users"], or undefined.
  const select = (() => {
    if (!selectParam) {
      // Default behavior: agents always, users only if mentions_v2 enabled.
      return { agents: true, users: mentions_v2_enabled };
    }

    if (typeof selectParam === "string") {
      return {
        agents: selectParam === "agents",
        users: selectParam === "users",
      };
    }

    const agents = selectParam.includes("agents");
    const users = selectParam.includes("users") && mentions_v2_enabled;

    return { agents, users };
  })();

  const suggestions = await suggestionsOfMentions(auth, {
    query,
    select,
  });

  return res.status(200).json({ suggestions });
}

export default withPublicAPIAuthentication(handler);
