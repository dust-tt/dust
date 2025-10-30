import { isLeft } from "fp-ts/lib/Either";
import { escape } from "html-escaper";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { updateWorkOSOrganizationName } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
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

const WorkspaceVoiceTranscriptionUpdateBodySchema = t.type({
  allowVoiceTranscription: t.boolean,
});

const PostWorkspaceRequestBodySchema = t.union([
  WorkspaceAllowedDomainUpdateBodySchema,
  WorkspaceNameUpdateBodySchema,
  WorkspaceSsoEnforceUpdateBodySchema,
  WorkspaceProvidersUpdateBodySchema,
  WorkspaceWorkOSUpdateBodySchema,
  WorkspaceInteractiveContentSharingUpdateBodySchema,
  WorkspaceVoiceTranscriptionUpdateBodySchema,
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

      const workspace = await WorkspaceResource.fetchByModelId(owner.id);
      if (!workspace) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "The workspace you're trying to modify was not found.",
          },
        });
      }

      if ("name" in body) {
        await workspace.update({
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
        await workspace.update({
          ssoEnforced: body.ssoEnforced,
        });

        owner.ssoEnforced = body.ssoEnforced;
      } else if (
        "whiteListedProviders" in body &&
        "defaultEmbeddingProvider" in body
      ) {
        await workspace.update({
          whiteListedProviders: body.whiteListedProviders,
          defaultEmbeddingProvider: body.defaultEmbeddingProvider,
        });
        owner.whiteListedProviders = body.whiteListedProviders;
        owner.defaultEmbeddingProvider = workspace.defaultEmbeddingProvider;
      } else if ("workOSOrganizationId" in body) {
        await workspace.update({
          workOSOrganizationId: body.workOSOrganizationId,
        });
        owner.workOSOrganizationId = body.workOSOrganizationId;
      } else if ("allowContentCreationFileSharing" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          allowContentCreationFileSharing: body.allowContentCreationFileSharing,
        };
        await workspace.update({ metadata: newMetadata });
        owner.metadata = newMetadata;

        // if public sharing is disabled, downgrade share scope of all public files to workspace
        if (!body.allowContentCreationFileSharing) {
          await FileResource.revokePublicSharingInWorkspace(auth);
        }
      } else if ("allowVoiceTranscription" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          allowVoiceTranscription: body.allowVoiceTranscription,
        };
        await workspace.update({ metadata: newMetadata });
        owner.metadata = newMetadata;
      } else {
        const { domain, domainAutoJoinEnabled } = body;
        const updateResult = await workspace.updateDomainAutoJoinEnabled(
          domainAutoJoinEnabled,
          domain
        );
        if (updateResult.isErr()) {
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
