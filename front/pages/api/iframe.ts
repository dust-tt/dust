import type { WithAPIErrorReponse } from "@dust-tt/types";
import { DustAPI, rateLimiter } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { prodAPICredentialsForOwner } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostUserMetadataResponseBody = {
  success: boolean;
};

export type GetCodeResponseBody = {
  code: string;
};

async function generateCode({
  instructions,
  prompt,
  model,
}: {
  instructions: string;
  prompt: string;
  model: string;
}) {
  console.log("Will talk to Dust", instructions, prompt);

  const modelParts = model.split("/");
  const prodCredentials = await prodAPICredentialsForOwner(null);
  const api = new DustAPI(prodCredentials, logger);
  const result = await api.runApp(
    {
      workspaceId: "0ec9852c2f",
      appId: "L-3r-eQ0d9",
      appHash:
        "7eff7dd3add34020e74423f08b3388daed2db0318cc4f6e7c4ba92c457142d64",
    },
    {
      MODEL: {
        provider_id: modelParts[0],
        model_id: modelParts[1],
        function_call: null,
        use_cache: true,
      },
    },
    [{ instructions: instructions, prompt: prompt }]
  );
  if (result.isErr()) {
    throw new Error("Failed to generate code" + result.error.message);
  }
  const markdownText = result.value.results[0][0].value.message.content;
  console.log("~~~~~~~ markdown text", markdownText);

  const code = markdownText.split("```")[1] || markdownText;
  const lines = code.split("\n");
  if (lines.length > 0) {
    if (lines[0].trim().toLowerCase().startsWith("javascript")) {
      // lines[0] = lines[0].replace("javascript", "//javascript");
      lines.shift();
    }
    if (lines[0].trim().toLowerCase() === "js") {
      lines.shift();
    }
    if (lines[0].trim().toLowerCase() === "jsx") {
      lines.shift();
    }
  }

  const finalCode = lines.length > 0 ? lines.join("\n") : code;

  return finalCode;
}

const cachedGenerateCode = generateCode;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<PostUserMetadataResponseBody | GetCodeResponseBody>
  >
): Promise<void> {
  // This functions retrieves the full user including all workspaces.

  const remamining = await rateLimiter({
    key: `code-interpreter}`,
    maxPerTimeframe: 100,
    timeframeSeconds: 60 * 30,
    logger: logger,
  });
  if (remamining <= 0) {
    return apiError(req, res, {
      status_code: 429,
      api_error: {
        type: "rate_limit_error",
        message: "You have exceeded the rate limit.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      console.log("req.body", req.body);
      const code = await cachedGenerateCode({
        prompt: req.body.prompt,
        instructions: req.body.instructions,
        model: req.body.model,
      });
      return res.status(200).json({ code: code });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withLogging(handler);
