import { parseMentionsInMarkdown } from "@app/lib/api/assistant/parse_mentions";
import type { ParseMentionsResponseBodyType } from "@dust-tt/client";
import { ParseMentionsRequestBodySchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/v1/w/:wId/assistant/mentions/parse.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/mentions/parse:
 *   post:
 *     summary: Parse mentions in markdown text
 *     description: |
 *       Parses pasted text containing @ mentions and converts them to the proper mention format.
 *       Matches @agentName or @userName patterns against available agents and users.
 *     tags:
 *       - Mentions
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - markdown
 *             properties:
 *               markdown:
 *                 type: string
 *                 description: Markdown text containing @ mentions to parse
 *                 example: "Hello @JohnDoe, can you help with @MyAgent?"
 *     responses:
 *       200:
 *         description: Parsed markdown with mentions converted to proper format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 markdown:
 *                   type: string
 *                   description: Processed markdown text with mentions converted to serialized format
 *       400:
 *         description: Bad Request. Missing or invalid request body.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       500:
 *         description: Internal Server Error.
 */
app.post(
  "/",
  validate("json", ParseMentionsRequestBodySchema),
  async (ctx): HandlerResult<ParseMentionsResponseBodyType> => {
    const auth = ctx.get("auth");
    const { markdown } = ctx.req.valid("json");

    const processedMarkdown = await parseMentionsInMarkdown({ auth, markdown });

    return ctx.json({ markdown: processedMarkdown });
  }
);

export default app;
