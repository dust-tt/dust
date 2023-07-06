import { NextApiRequest, NextApiResponse } from "next";

import { DustProdActionRegistry } from "@app/lib/actions/registry";
import { runActionStreamed } from "@app/lib/actions/server";
import { Authenticator, getSession } from "@app/lib/auth";
import { DustAppConfigType } from "@app/lib/dust_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";

export const config = {
  api: {
    responseLimit: "8mb",
  },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only users of the current workspace can run actions.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      if (!(typeof req.query.action === "string")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters, `action` (string) is required.",
          },
        });
      }

      if (
        !req.body ||
        !(typeof req.body.config === "object" && req.body.config !== null) ||
        !Array.isArray(req.body.inputs)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid request body, `config` (object), and `inputs` (array) are required.",
          },
        });
      }

      if (!DustProdActionRegistry[req.query.action]) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "action_unknown_error",
            message: `Unknown action: ${req.query.action}`,
          },
        });
      }

      const config = req.body.config as DustAppConfigType;
      const inputs = req.body.inputs as Array<any>;

      const actionRes = await runActionStreamed(
        owner,
        req.query.action,
        config,
        inputs
      );

      if (actionRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "action_api_error",
            message: `Error running action: action=${req.query.action} error=${actionRes.error.message}`,
          },
        });
      }

      const { eventStream } = actionRes.value;

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

      res.end();
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
