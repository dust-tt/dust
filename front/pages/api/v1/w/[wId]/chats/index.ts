import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

import { newChat } from "@app/lib/api/chat";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { parse_payload } from "@app/lib/http_utils";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export type ChatNewPostQuery = {
  user_message: string;
  time_zone: string;
};

const chat_new_scheme: JSONSchemaType<ChatNewPostQuery> = {
  type: "object",
  properties: {
    user_message: { type: "string" },
    time_zone: { type: "string" },
  },
  required: ["user_message"],
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReturnedAPIErrorType>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { auth, keyWorkspaceId } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  if (!keyRes.value.isSystem) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The Chat API is only accessible by system API Key. Ping us at team@dust.tt if you want access to it.",
      },
    });
  }

  if (keyWorkspaceId !== req.query.wId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The Chat API is only available on your own workspace.",
      },
    });
  }

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to run was not found",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const pRes = parse_payload(chat_new_scheme, req.body);
      if (pRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid body sent: ${pRes.error.message}`,
          },
        });
      }

      const userMessage = pRes.value.user_message;
      const timeZone = pRes.value.time_zone;

      try {
        Intl.DateTimeFormat(undefined, { timeZone });
      } catch (e) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid time_zone. Time zones must be valid for javascript's Intl.DateTimeFormat.`,
          },
        });
      }

      logger.info(
        {
          workspace: {
            sId: owner.sId,
            name: owner.name,
          },
        },
        "New chat API call"
      );

      const eventStream = newChat(auth, userMessage, null, null, timeZone);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.flushHeaders();

      for await (const event of eventStream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        // @ts-expect-error - We need it for streaming but it does not exists in the types.
        res.flush();
      }

      res.status(200).end();
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
