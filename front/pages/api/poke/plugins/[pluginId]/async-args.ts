import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { fetchPluginResource } from "@app/lib/api/poke/utils";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type {
  AsyncEnumValues,
  EnumValues,
  SupportedResourceType,
} from "@app/types/poke/plugins";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export interface PokeGetPluginAsyncArgsResponseBody {
  asyncArgs: Record<
    string,
    string | number | boolean | AsyncEnumValues | EnumValues
  >;
}

const asyncArgsCodec = t.type({
  pluginId: t.string,
  resourceType: t.string,
  resourceId: t.union([t.string, t.undefined]),
  workspaceId: t.union([t.string, t.undefined]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PokeGetPluginAsyncArgsResponseBody>
  >,
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
    case "GET": {
      const queryValidation = asyncArgsCodec.decode(req.query);

      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { pluginId, resourceType, resourceId, workspaceId } =
        queryValidation.right;

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

      // Check if plugin has async fields.
      const hasAsyncFields = Object.values(plugin.manifest.args).some(
        (arg) => arg.async === true
      );
      if (!hasAsyncFields) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Plugin does not have any async fields defined.",
          },
        });
      }

      if (!plugin.populateAsyncArgs) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message:
              "Plugin has async fields but missing populateAsyncArgs implementation. This should not happen with proper TypeScript validation.",
          },
        });
      }

      // If the run targets a specific workspace, use a workspace-scoped authenticator.
      if (workspaceId) {
        auth = await Authenticator.fromSuperUserSession(session, workspaceId);
      }

      // Get the resource if resourceId is provided
      let resource = null;
      if (resourceId && typeof resourceId === "string") {
        resource = await fetchPluginResource(
          auth,
          resourceType as SupportedResourceType,
          resourceId
        );
        if (!resource) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "invalid_request_error",
              message: "Could not find the resource.",
            },
          });
        }
      }

      const asyncArgsResult = await plugin.populateAsyncArgs(auth, resource);
      if (asyncArgsResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to populate async args: ${asyncArgsResult.error.message}`,
          },
        });
      }

      res.status(200).json({ asyncArgs: asyncArgsResult.value });
      return;
    }

    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForPoke(handler);
