import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type { PluginResponse } from "@app/lib/api/poke/types";
import { fetchPluginResource } from "@app/lib/api/poke/utils";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { createIoTsCodecFromArgs, supportedResourceTypes } from "@app/types";

const [first, second, ...rest] = supportedResourceTypes;
const SupportedResourceTypeCodec = t.union([
  t.literal(first),
  t.literal(second),
  ...rest.map((value) => t.literal(value)),
]);

const RunPluginParamsCodec = t.union([
  t.type({
    pluginId: t.string,
    resourceType: SupportedResourceTypeCodec,
  }),
  t.type({
    pluginId: t.string,
    resourceId: t.string,
    resourceType: SupportedResourceTypeCodec,
    workspaceId: t.string,
  }),
]);

export interface PokeRunPluginResponseBody {
  result: PluginResponse;
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

      const { pluginId, resourceType } = pluginRunValidation.right;
      const { resourceId, workspaceId } =
        "resourceId" in pluginRunValidation.right
          ? pluginRunValidation.right
          : {
              resourceId: undefined,
              workspaceId: undefined,
            };

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

      const resource = resourceId
        ? await fetchPluginResource(auth, resourceType, resourceId)
        : null;

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

      const pluginRun = await PluginRunResource.makeNew(
        plugin,
        pluginArgsValidation.right,
        auth.getNonNullableUser(),
        workspaceId ? auth.getNonNullableWorkspace() : null,
        {
          resourceId: resourceId ?? undefined,
          resourceType,
        }
      );

      const runRes = await plugin.execute(
        auth,
        resource,
        pluginArgsValidation.right
      );

      if (runRes.isErr()) {
        await pluginRun.recordError(runRes.error.message);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "plugin_execution_failed",
            message: runRes.error.message,
          },
        });
      }

      await pluginRun.recordResult(runRes.value);

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
