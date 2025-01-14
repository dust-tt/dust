import type {
  PlatformActionsConfigurationType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { PlatformActionsConfigurationResource } from "@app/lib/resources/platform_actions_configuration_resource";
import { apiError } from "@app/logger/withlogging";

export type GetPlatformActionsConfigurationResponseBody = {
  configurations: PlatformActionsConfigurationType[];
};

export type PostPlatformActionsConfigurationResponseBody = {
  configuration: PlatformActionsConfigurationType;
};

const PostPlatformActionsConfigurationBodySchema = t.type({
  provider: t.literal("github"),
  connectionId: t.string,
});

export type PostPlatformActionsConfigurationBodySchemaType = t.TypeOf<
  typeof PostPlatformActionsConfigurationBodySchema
>;

const DeletePlatformActionsConfigurationBodySchema = t.type({
  provider: t.literal("github"),
});

export type DeletePlatformActionsConfigurationBodySchemaType = t.TypeOf<
  typeof DeletePlatformActionsConfigurationBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetPlatformActionsConfigurationResponseBody
      | PostPlatformActionsConfigurationResponseBody
      | void
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only admins can interact with platofrm actions configurations",
      },
    });
  }

  const configurations =
    await PlatformActionsConfigurationResource.listByWorkspace(auth);

  switch (req.method) {
    case "GET":
      return res.status(200).json({
        configurations: configurations.map((c) => c.toJSON()),
      });

    case "POST": {
      const bodyValidation = PostPlatformActionsConfigurationBodySchema.decode(
        req.body
      );
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }
      const body = bodyValidation.right;

      // We only allow one connection per workspace and provider.
      let configuration = configurations.find(
        (c) => c.provider === body.provider
      );
      if (configuration) {
        await configuration.updateConnection(auth, {
          connectionId: body.connectionId,
        });
      } else {
        configuration = await PlatformActionsConfigurationResource.makeNew(
          auth,
          {
            provider: body.provider,
            connectionId: body.connectionId,
          }
        );
      }

      return res.status(201).json({
        configuration: configuration.toJSON(),
      });
    }

    case "DELETE": {
      const bodyValidation =
        DeletePlatformActionsConfigurationBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }
      const body = bodyValidation.right;

      const configuration =
        await PlatformActionsConfigurationResource.findByWorkspaceAndProvider(
          auth,
          {
            provider: body.provider,
          }
        );

      if (configuration) {
        // TODO(spolu): disconnect the installation if we can.
        await configuration.delete(auth);
      }

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
