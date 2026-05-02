/** @ignoreswagger */

import { parseMentionsInMarkdown } from "@app/lib/api/assistant/parse_mentions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const ParseMentionsRequestBodySchema = z.object({
  markdown: z.string(),
});

type ParseMentionsResponseBody = {
  markdown: string;
};

/**
 * Parses pasted text containing @ mentions and converts them to the proper mention format.
 * Matches @agentName or @userName patterns against available agents and users.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ParseMentionsResponseBody>>,
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

  const parseResult = ParseMentionsRequestBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(parseResult.error).toString(),
      },
    });
  }

  const { markdown } = parseResult.data;

  const processedMarkdown = await parseMentionsInMarkdown({ auth, markdown });

  return res.status(200).json({ markdown: processedMarkdown });
}

export default withSessionAuthenticationForWorkspace(handler);
