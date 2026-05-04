import { parseMentionsInMarkdown } from "@app/lib/api/assistant/parse_mentions";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ParseMentionsResponseBodyType } from "@dust-tt/client";
import { ParseMentionsRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

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
 *       405:
 *         description: Method not supported. Only POST is expected.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ParseMentionsResponseBodyType>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const { markdown } = ParseMentionsRequestBodySchema.parse(req.body);

  const processedMarkdown = await parseMentionsInMarkdown({ auth, markdown });

  return res.status(200).json({ markdown: processedMarkdown });
}

export default withPublicAPIAuthentication(handler);
