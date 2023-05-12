import { NextApiRequest, NextApiResponse } from "next";

import { DustProdActionRegistry } from "@app/lib/actions_registry";
import {
  Authenticator,
  getSession,
  prodAPICredentialsForOwner,
} from "@app/lib/auth";
import { DustAppConfigType } from "@app/lib/dust_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export const config = {
  api: {
    responseLimit: "8mb",
  },
};

const { DUST_API = "https://dust.tt" } = process.env;

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
  if (!owner || owner.type !== "team") {
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

      let action = DustProdActionRegistry[req.query.action];
      let config = req.body.config as DustAppConfigType;
      let inputs = req.body.inputs as Array<any>;

      const prodCredentials = await prodAPICredentialsForOwner(owner);

      logger.info(
        {
          worskapce: {
            sId: owner.sId,
            name: owner.name,
          },
          action: req.query.action,
          app: action.app,
          url: `${DUST_API}/api/v1/w/${action.app.workspaceId}/apps/${action.app.appId}/runs`,
        },
        "Action run creation"
      );

      const apiRes = await fetch(
        `${DUST_API}/api/v1/w/${action.app.workspaceId}/apps/${action.app.appId}/runs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${prodCredentials.apiKey}`,
          },
          body: JSON.stringify({
            specification_hash: action.app.appHash,
            config: config,
            stream: true,
            blocking: false,
            inputs: inputs,
          }),
        }
      );

      if (!apiRes.ok && apiRes.body) {
        let body = await apiRes.text();
        console.log("BODY", body);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "action_api_error",
            message: `Error running streamed app: action=${req.query.action} status_code=${apiRes.status}`,
          },
        });
      }

      if (!apiRes.ok || !apiRes.body) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "action_api_error",
            message: `Error running streamed app: action=${req.query.action} status_code=${apiRes.status}`,
          },
        });
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const reader = apiRes.body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          res.write(value);
          // @ts-expect-error
          res.flush();
        }
      } catch (e) {
        logger.error(
          {
            error: e,
          },
          "Error streaming chunks while running action"
        );
      } finally {
        reader.releaseLock();
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
