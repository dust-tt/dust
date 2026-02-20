import { isLeft } from "fp-ts/lib/Either";
import { escape } from "html-escaper";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  buildAuditActor,
  buildWorkspaceTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { updateWorkOSOrganizationName } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError } from "@app/logger/withlogging";
import { EmbeddingProviderCodec } from "@app/types/assistant/models/embedding";
import { ModelProviderIdCodec } from "@app/types/assistant/models/providers";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { WorkspaceType } from "@app/types/user";

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

const WorkspaceBatchDomainUpdateBodySchema = t.type({
  domainUpdates: t.array(
    t.type({
      domain: t.string,
      domainAutoJoinEnabled: t.boolean,
    })
  ),
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
  WorkspaceBatchDomainUpdateBodySchema,
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
        const previousName = owner.name;
        await workspace.updateWorkspaceSettings({
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

        void emitAuditLogEvent({
          workspace: owner,
          action: "workspace.renamed",
          actor: buildAuditActor(auth),
          targets: [buildWorkspaceTarget(owner)],
          context: getAuditLogContext(auth, req),
          metadata: {
            previousName,
            newName: body.name,
          },
        });
      } else if ("ssoEnforced" in body) {
        const previousValue = owner.ssoEnforced;
        await workspace.updateWorkspaceSettings({
          ssoEnforced: body.ssoEnforced,
        });

        owner.ssoEnforced = body.ssoEnforced;

        void emitAuditLogEvent({
          workspace: owner,
          action: "workspace.sso_enforcement_changed",
          actor: buildAuditActor(auth),
          targets: [buildWorkspaceTarget(owner)],
          context: getAuditLogContext(auth, req),
          metadata: {
            previousValue: previousValue,
            newValue: body.ssoEnforced,
          },
        });
      } else if (
        "whiteListedProviders" in body &&
        "defaultEmbeddingProvider" in body
      ) {
        const previousProviders = owner.whiteListedProviders;
        const previousEmbeddingProvider = owner.defaultEmbeddingProvider;
        await workspace.updateWorkspaceSettings({
          whiteListedProviders: body.whiteListedProviders,
          defaultEmbeddingProvider: body.defaultEmbeddingProvider,
        });
        owner.whiteListedProviders = body.whiteListedProviders;
        owner.defaultEmbeddingProvider = workspace.defaultEmbeddingProvider;

        void emitAuditLogEvent({
          workspace: owner,
          action: "workspace.providers_changed",
          actor: buildAuditActor(auth),
          targets: [buildWorkspaceTarget(owner)],
          context: getAuditLogContext(auth, req),
          metadata: {
            previousProviders: JSON.stringify(previousProviders),
            newProviders: JSON.stringify(body.whiteListedProviders),
            previousEmbeddingProvider: String(previousEmbeddingProvider),
            newEmbeddingProvider: String(body.defaultEmbeddingProvider),
          },
        });
      } else if ("workOSOrganizationId" in body) {
        await workspace.updateWorkspaceSettings({
          workOSOrganizationId: body.workOSOrganizationId,
        });
        owner.workOSOrganizationId = body.workOSOrganizationId;
      } else if ("allowContentCreationFileSharing" in body) {
        const previousValue =
          owner.metadata?.allowContentCreationFileSharing ?? false;
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          allowContentCreationFileSharing: body.allowContentCreationFileSharing,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;

        // if public sharing is disabled, downgrade share scope of all public files to workspace
        if (!body.allowContentCreationFileSharing) {
          await FileResource.revokePublicSharingInWorkspace(auth);
        }

        void emitAuditLogEvent({
          workspace: owner,
          action: "workspace.file_sharing_changed",
          actor: buildAuditActor(auth),
          targets: [buildWorkspaceTarget(owner)],
          context: getAuditLogContext(auth, req),
          metadata: {
            previousValue: previousValue,
            newValue: body.allowContentCreationFileSharing,
          },
        });
      } else if ("allowVoiceTranscription" in body) {
        const previousValue =
          owner.metadata?.allowVoiceTranscription ?? false;
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          allowVoiceTranscription: body.allowVoiceTranscription,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;

        void emitAuditLogEvent({
          workspace: owner,
          action: "workspace.voice_transcription_changed",
          actor: buildAuditActor(auth),
          targets: [buildWorkspaceTarget(owner)],
          context: getAuditLogContext(auth, req),
          metadata: {
            previousValue: previousValue,
            newValue: body.allowVoiceTranscription,
          },
        });
      } else if ("domainUpdates" in body) {
        for (const update of body.domainUpdates) {
          const updateResult = await workspace.updateDomainAutoJoinEnabled({
            domainAutoJoinEnabled: update.domainAutoJoinEnabled,
            domain: update.domain,
          });
          if (updateResult.isErr()) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: updateResult.error.message,
              },
            });
          }
        }

        void emitAuditLogEvent({
          workspace: owner,
          action: "workspace.domains_batch_updated",
          actor: buildAuditActor(auth),
          targets: [buildWorkspaceTarget(owner)],
          context: getAuditLogContext(auth, req),
          metadata: {
            updates: JSON.stringify(body.domainUpdates),
          },
        });
      } else {
        const { domain, domainAutoJoinEnabled } = body;
        const updateResult = await workspace.updateDomainAutoJoinEnabled({
          domainAutoJoinEnabled,
          domain,
        });
        if (updateResult.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: updateResult.error.message,
            },
          });
        }

        void emitAuditLogEvent({
          workspace: owner,
          action: "workspace.auto_join_changed",
          actor: buildAuditActor(auth),
          targets: [buildWorkspaceTarget(owner)],
          context: getAuditLogContext(auth, req),
          metadata: {
            domain: domain ?? "all",
            enabled: domainAutoJoinEnabled,
          },
        });
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
