import type { WithAPIErrorResponse } from "@dust-tt/types";
import { createIoTsCodecFromArgs } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export const RunPluginParamsCodec = t.intersection([
  t.type({
    pluginId: t.string,
  }),
  // If workspaceId is provided, we can only run plugin on a specific resourceId.
  t.partial({
    resourceId: t.string,
    workspaceId: t.string,
  }),
]);

export interface PokeRunPluginResponseBody {
  result: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeRunPluginResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  let auth = await Authenticator.fromSuperUserSession(session, null);
  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const pluginRunValidation = RunPluginParamsCodec.decode(req.query);
      if (isLeft(pluginRunValidation)) {
        const pathError = reporter.formatValidationErrors(
          pluginRunValidation.left
        );

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The query is invalid: ${pathError}`,
          },
        });
      }

      const { pluginId, resourceId, workspaceId } = pluginRunValidation.right;
      // If the run targets a specific workspace, use a workspace-scoped authenticator.
      if (workspaceId) {
        auth = await Authenticator.fromSuperUserSession(session, workspaceId);
      }

      const plugin = pluginManager.getPluginById(pluginId);
      if (!plugin) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "plugin_not_found",
            message: "Could not find the plugin.",
          },
        });
      }

      const pluginCodec = createIoTsCodecFromArgs(plugin.manifest.args);
      const pluginArgsValidation = pluginCodec.decode(req.body);
      if (isLeft(pluginArgsValidation)) {
        const pathError = reporter.formatValidationErrors(
          pluginArgsValidation.left
        );

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}`,
          },
        });
      }

      // Consider saving plugin run in DB.
      logger.info(
        {
          pluginId,
          author: auth.getNonNullableUser().email,
        },
        "Running Poke plugin."
      );
      const runRes = await plugin.execute(
        auth,
        resourceId,
        pluginArgsValidation.right
      );
      if (runRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "plugin_execution_failed",
            message: runRes.error.message,
          },
        });
      }

      res.status(200).json({ result: runRes.value });

      return;
    }

    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
    }
  }
}

export default withSessionAuthentication(handler);
