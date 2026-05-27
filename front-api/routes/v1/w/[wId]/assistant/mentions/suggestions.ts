import {
  parseMentionSelectParam,
  suggestionsOfMentions,
} from "@app/lib/api/assistant/conversation/mention_suggestions";
import type { GetMentionSuggestionsResponseBodyType } from "@dust-tt/client";
import { GetMentionSuggestionsRequestQuerySchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { fromError } from "zod-validation-error";

// Mounted at /api/v1/w/:wId/assistant/mentions/suggestions.
const app = publicApiApp();

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
 *       405:
 *         description: Method not supported. Only GET is expected.
 *       500:
 *         description: Internal Server Error.
 */
app.get(
  "/",
  async (ctx): HandlerResult<GetMentionSuggestionsResponseBodyType> => {
    const auth = ctx.get("auth");

    // Extract query params preserving array semantics (multiple `select` values)
    // to match the Next.js req.query shape the schema expects.
    const url = new URL(ctx.req.url);
    const rawQuery: Record<string, string | string[]> = {};
    for (const [key, value] of url.searchParams.entries()) {
      const existing = rawQuery[key];
      if (existing !== undefined) {
        rawQuery[key] = Array.isArray(existing)
          ? [...existing, value]
          : [existing, value];
      } else {
        rawQuery[key] = value;
      }
    }

    const parsedQuery =
      GetMentionSuggestionsRequestQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid query parameters: ${fromError(parsedQuery.error).toString()}`,
        },
      });
    }

    const { query, select: selectParam, current } = parsedQuery.data;

    const suggestions = await suggestionsOfMentions(auth, {
      query,
      select: parseMentionSelectParam(selectParam),
      current,
    });

    return ctx.json({ suggestions });
  }
);

export default app;
