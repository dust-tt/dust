/** @ignoreswagger */

import { parseMentionsInMarkdown } from "@app/lib/api/assistant/parse_mentions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

const ParseMentionsRequestBodySchema = t.type({
  markdown: t.string,
});

type ParseMentionsResponseBody = {
  markdown: string;
};

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

  const parsedBody = ParseMentionsRequestBodySchema.decode(req.body);

  if (isLeft(parsedBody)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request body, `markdown` (string) is required.",
      },
    });
  }

  const { markdown } = parsedBody.right;

  const processedMarkdown = await parseMentionsInMarkdown({ auth, markdown });

  return res.status(200).json({ markdown: processedMarkdown });
}

export default withSessionAuthenticationForWorkspace(handler);
