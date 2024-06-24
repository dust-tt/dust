import type { WithAPIErrorReponse } from "@dust-tt/types";
import { rateLimiter } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";
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
}: {
  instructions: string;
  prompt: string;
}) {
  console.log("Will talk to Openai", instructions, prompt);
  const openai = new OpenAI({
    apiKey: process.env["DUST_MANAGED_OPENAI_API_KEY"], // This is the default and can be omitted
  });
  console.log("Will talk to Openai");
  const chatCompletion = await openai.chat.completions.create({
    messages: [
      {
        role: "system",
        content: instructions,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    model: "gpt-4",
    temperature: 0.2,
  });

  console.log("Got response from Openai");
  console.log(JSON.stringify(chatCompletion, null, 2));

  const markdownText = chatCompletion.choices[0].message.content || "";
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
  const session = await getSession(req, res);

  // This functions retrieves the full user including all workspaces.
  const user = await getUserFromSession(session);
  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user was not found.",
      },
    });
  }

  const remamining = await rateLimiter({
    key: `code-interpreter-${user.id}`,
    maxPerTimeframe: 100,
    timeframeSeconds: 60 * 24,
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

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user was not found.",
      },
    });
  }
  if (!user.email.includes("@dust.tt")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "user_not_found",
        message: "Only Dust users can access this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      console.log("req.body", req.body);
      const code = await cachedGenerateCode({
        prompt: req.body.prompt,
        instructions: req.body.instructions,
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
