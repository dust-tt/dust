import { isLeft } from "fp-ts/lib/Either";
import { escape } from "html-escaper";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { updateWorkOSOrganizationName } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse, WorkspaceType } from "@app/types";
import { EmbeddingProviderCodec, ModelProviderIdCodec } from "@app/types";

export type PostWorkspaceResponseBody = {
  workspace: WorkspaceType;
};

export type GetWorkspaceResponseBody = {
  workspace: WorkspaceType;
};

const WorkspaceNameUpdateBodySchema = t.type({
  name: t.string,
});

const WorkspaceSsoEnforceUpdateBodySchema = t.type({
  ssoEnforced: t.boolean,
});

const WorkspaceAllowedDomainUpdateBodySchema = t.type({
  domain: t.union([t.string, t.undefined]),
  domainAutoJoinEnabled: t.boolean,
});

const WorkspaceProvidersUpdateBodySchema = t.type({
  whiteListedProviders: t.array(ModelProviderIdCodec),
  defaultEmbeddingProvider: t.union([EmbeddingProviderCodec, t.null]),
});

const WorkspaceWorkOSUpdateBodySchema = t.type({
  workOSOrganizationId: t.union([t.string, t.null]),
});

const WorkspaceInteractiveContentSharingUpdateBodySchema = t.type({
  allowContentCreationFileSharing: t.boolean,
});

const PostWorkspaceRequestBodySchema = t.union([
  WorkspaceAllowedDomainUpdateBodySchema,
  WorkspaceNameUpdateBodySchema,
  WorkspaceSsoEnforceUpdateBodySchema,
  WorkspaceProvidersUpdateBodySchema,
  WorkspaceWorkOSUpdateBodySchema,
  WorkspaceInteractiveContentSharingUpdateBodySchema,
]);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceResponseBody | PostWorkspaceResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      res.status(200).json({ workspace: owner });
      return;

    case "POST":
      const bodyValidation = PostWorkspaceRequestBodySchema.decode(req.body);
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
      const { right: body } = bodyValidation;

      // TODO: move to WorkspaceResource.
      const w = await WorkspaceModel.findOne({
        where: { id: owner.id },
      });
      if (!w) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "The workspace you're trying to modify was not found.",
          },
        });
      }

      if ("name" in body) {
        await w.update({
          name: escape(body.name),
        });
        owner.name = body.name;

        const updateRes = await updateWorkOSOrganizationName(owner);
        if (updateRes.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to update WorkOS organization name: ${updateRes.error.message}`,
            },
          });
        }
      } else if ("ssoEnforced" in body) {
        await w.update({
          ssoEnforced: body.ssoEnforced,
        });

        owner.ssoEnforced = body.ssoEnforced;
      } else if (
        "whiteListedProviders" in body &&
        "defaultEmbeddingProvider" in body
      ) {
        await w.update({
          whiteListedProviders: body.whiteListedProviders,
          defaultEmbeddingProvider: body.defaultEmbeddingProvider,
        });
        owner.whiteListedProviders = body.whiteListedProviders;
        owner.defaultEmbeddingProvider = w.defaultEmbeddingProvider;
      } else if ("workOSOrganizationId" in body) {
        await w.update({
          workOSOrganizationId: body.workOSOrganizationId,
        });
        owner.workOSOrganizationId = body.workOSOrganizationId;
      } else if ("allowContentCreationFileSharing" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          allowContentCreationFileSharing: body.allowContentCreationFileSharing,
        };
        await w.update({ metadata: newMetadata });
        owner.metadata = newMetadata;
      } else {
        const { domain, domainAutoJoinEnabled } = body;
        const [affectedCount] = await WorkspaceHasDomainModel.update(
          {
            domainAutoJoinEnabled,
          },
          {
            where: {
              workspaceId: w.id,
              ...(domain ? { domain } : {}),
            },
          }
        );
        if (affectedCount === 0) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "The workspace does not have any verified domain.",
            },
          });
        }
      }

      res.status(200).json({ workspace: owner });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, POST or GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
