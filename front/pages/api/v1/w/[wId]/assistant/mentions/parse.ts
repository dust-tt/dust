import type { ParseMentionsResponseBodyType } from "@dust-tt/client";
import { ParseMentionsRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import { apiError } from "@app/logger/withlogging";
import type { RichAgentMention, WithAPIErrorResponse } from "@app/types";
import { toRichAgentMentionType } from "@app/types";

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

  // Fetch agent configurations.
  const agentConfigurations = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "light",
  });

  // Build agent mentions map.
  const agentMentions: RichAgentMention[] = agentConfigurations
    .filter((a) => a.status === "active")
    .map(toRichAgentMentionType);

  // Disabling user mentions for now, as it may lead to customer pinging users unintentionally.
  //
  // const userMentions: RichUserMention[] = [];
  // const { members } = await getMembers(auth, { activeOnly: true });
  //
  // userMentions.push(...members.map(toRichUserMentionType));

  // Combine all mentions for matching.
  const allMentions = [...agentMentions /*, ...userMentions*/];

  // Sort mentions by label length (descending) to match longer names first.
  // This prevents "AI Assistant Pro" from being matched as "AI" when both exist.
  allMentions.sort((a, b) => b.label.length - a.label.length);

  let processedMarkdown = markdown;

  for (const mention of allMentions) {
    // Use a safe case-insensitive substring search instead of compiling a RegExp
    // per mention. This avoids expensive regex compilation on potentially
    // attacker-controlled large labels or markdown bodies while preserving the
    // previous matching semantics: an @mention must be at the start or preceded
    // by whitespace, and must be followed by whitespace, end-of-string, or
    // punctuation.

    // Skip empty labels and extremely long labels to avoid pathological work.
    if (!mention.label || mention.label.length > 1000) {
      continue;
    }

    const serialized = serializeMention(mention);

    // Work with a lowercase copy for case-insensitive searching, but perform
    // replacements on the original string to preserve character casing outside
    // of the inserted serialized mention.
    let lowerText = processedMarkdown.toLowerCase();
    const needle = `@${mention.label}`.toLowerCase();
    let searchIndex = 0;

    while (true) {
      const pos = lowerText.indexOf(needle, searchIndex);
      if (pos === -1) {
        break;
      }

      // Check character before the match (if any) is start or whitespace
      const beforeIdx = pos - 1;
      if (beforeIdx >= 0) {
        const beforeChar = lowerText.charAt(beforeIdx);
        if (!/\s/.test(beforeChar)) {
          searchIndex = pos + 1; // continue searching
          continue;
        }
      }

      // Check character after the match (if any) is whitespace, punctuation, or end
      const afterIdx = pos + needle.length;
      const afterChar = lowerText.charAt(afterIdx);
      if (afterChar && !/\s|[.,!?;:]/.test(afterChar)) {
        searchIndex = pos + 1;
        continue;
      }

      // Valid mention found — replace the @label with the serialized mention
      processedMarkdown =
        processedMarkdown.slice(0, pos) +
        serialized +
        processedMarkdown.slice(afterIdx);

      // Update lowercase copy and continue searching after the inserted text
      lowerText = processedMarkdown.toLowerCase();
      searchIndex = pos + serialized.length;
    }
  }

  return res.status(200).json({ markdown: processedMarkdown });
}

export default withPublicAPIAuthentication(handler);
