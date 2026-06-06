// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { listActiveAgentsUsingNonRegionalModels } from "@app/lib/api/assistant/workspace_capabilities";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type {
  GetWorkspaceResponseBody,
  PostWorkspaceResponseBody,
} from "@app/lib/api/workspace";
import { renameWorkspace } from "@app/lib/api/workspace";
import { type Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { EmbeddingProviderSchema } from "@app/types/assistant/models/embedding";
import { ModelProviderIdSchema } from "@app/types/assistant/models/providers";
import type { WithAPIErrorResponse } from "@app/types/error";
import { escape } from "html-escaper";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const WorkspaceNameUpdateBodySchema = z.object({
  name: z.string(),
});

const WorkspaceSsoEnforceUpdateBodySchema = z.object({
  ssoEnforced: z.boolean(),
});

const WorkspaceRegionalModelsOnlyUpdateBodySchema = z.object({
  regionalModelsOnly: z.boolean(),
});

const WorkspaceAllowedDomainUpdateBodySchema = z.object({
  domain: z.string().optional(),
  domainAutoJoinEnabled: z.boolean(),
});

const WorkspaceBatchDomainUpdateBodySchema = z.object({
  domainUpdates: z.array(
    z.object({
      domain: z.string(),
      domainAutoJoinEnabled: z.boolean(),
    })
  ),
});

const WorkspaceProvidersUpdateBodySchema = z.object({
  whiteListedProviders: z.array(ModelProviderIdSchema),
  defaultEmbeddingProvider: EmbeddingProviderSchema.nullable(),
});

const WorkspaceWorkOSUpdateBodySchema = z.object({
  workOSOrganizationId: z.string().nullable(),
});

// TODO(2026-03-20 FRAME SHARING): Remove once all clients have refreshed.
const WorkspaceInteractiveContentSharingUpdateBodySchema = z.object({
  allowContentCreationFileSharing: z.boolean(),
});

const WorkspaceSharingPolicyUpdateBodySchema = z.object({
  sharingPolicy: z.enum([
    "all_scopes",
    "workspace_only",
    "workspace_and_emails",
  ]),
});

const WorkspaceVoiceTranscriptionUpdateBodySchema = z.object({
  allowVoiceTranscription: z.boolean(),
});

const WorkspacePrivateConversationUrlsUpdateBodySchema = z.object({
  privateConversationUrlsByDefault: z.boolean(),
});

const WorkspaceEmailAgentsUpdateBodySchema = z.object({
  allowEmailAgents: z.boolean(),
});

const WorkspaceAgentReinforcementUpdateBodySchema = z.object({
  allowReinforcement: z.boolean(),
});

const WorkspaceReinforcementBatchModeUpdateBodySchema = z.object({
  allowReinforcementBatchMode: z.boolean(),
});

const WorkspaceExtensionMcpToolsUpdateBodySchema = z.object({
  disableExtensionMcpTools: z.boolean(),
});

const WorkspaceOpenProjectsUpdateBodySchema = z.object({
  allowOpenProjects: z.boolean(),
});

const WorkspaceManualProjectKnowledgeManagementUpdateBodySchema = z.object({
  allowManualProjectKnowledgeManagement: z.boolean(),
});

const WorkspaceSandboxAgentEgressRequestsUpdateBodySchema = z.object({
  sandboxAllowAgentEgressRequests: z.boolean(),
});

const WorkspaceReinforcementCapUpdateBodySchema = z.object({
  reinforcementCapMicroUsd: z.number(),
});

const WorkspaceSelfImprovementCapPerSkillUpdateBodySchema = z.object({
  selfImprovementCapPerSkillMicroUsd: z.number(),
});

const WorkspaceAuditLogsUpdateBodySchema = z.object({
  disableAuditLogs: z.boolean(),
});

const PostWorkspaceRequestBodySchema = z.union([
  WorkspaceAllowedDomainUpdateBodySchema,
  WorkspaceBatchDomainUpdateBodySchema,
  WorkspaceNameUpdateBodySchema,
  WorkspaceSsoEnforceUpdateBodySchema,
  WorkspaceRegionalModelsOnlyUpdateBodySchema,
  WorkspaceProvidersUpdateBodySchema,
  WorkspaceWorkOSUpdateBodySchema,
  WorkspaceInteractiveContentSharingUpdateBodySchema,
  WorkspaceSharingPolicyUpdateBodySchema,
  WorkspaceVoiceTranscriptionUpdateBodySchema,
  WorkspacePrivateConversationUrlsUpdateBodySchema,
  WorkspaceEmailAgentsUpdateBodySchema,
  WorkspaceAgentReinforcementUpdateBodySchema,
  WorkspaceReinforcementBatchModeUpdateBodySchema,
  WorkspaceExtensionMcpToolsUpdateBodySchema,
  WorkspaceOpenProjectsUpdateBodySchema,
  WorkspaceManualProjectKnowledgeManagementUpdateBodySchema,
  WorkspaceSandboxAgentEgressRequestsUpdateBodySchema,
  WorkspaceReinforcementCapUpdateBodySchema,
  WorkspaceSelfImprovementCapPerSkillUpdateBodySchema,
  WorkspaceAuditLogsUpdateBodySchema,
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
      const bodyValidation = PostWorkspaceRequestBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }
      const { data: body } = bodyValidation;

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
        const newName = escape(body.name);
        const renameRes = await renameWorkspace(owner, newName);
        if (renameRes.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: renameRes.error.message,
            },
          });
        }
        owner.name = newName;
      } else if ("ssoEnforced" in body) {
        await workspace.updateWorkspaceSettings({
          ssoEnforced: body.ssoEnforced,
        });

        owner.ssoEnforced = body.ssoEnforced;
      } else if ("regionalModelsOnly" in body) {
        if (body.regionalModelsOnly) {
          const incompatibleAgentIds =
            await listActiveAgentsUsingNonRegionalModels(auth);
          if (incompatibleAgentIds.length > 0) {
            logger.warn(
              {
                workspaceId: owner.sId,
                incompatibleAgentIds,
              },
              "Blocked enabling regionalModelsOnly: active agents use non-regional models."
            );
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: `${incompatibleAgentIds.length} active agent(s) use a non-regional model. Update them first.`,
              },
            });
          }
        }

        await workspace.updateWorkspaceSettings({
          regionalModelsOnly: body.regionalModelsOnly,
        });

        owner.regionalModelsOnly = body.regionalModelsOnly;
      } else if (
        "whiteListedProviders" in body &&
        "defaultEmbeddingProvider" in body
      ) {
        await workspace.updateWorkspaceSettings({
          whiteListedProviders: body.whiteListedProviders,
          defaultEmbeddingProvider: body.defaultEmbeddingProvider,
        });
        owner.whiteListedProviders = body.whiteListedProviders;
        owner.defaultEmbeddingProvider = workspace.defaultEmbeddingProvider;
      } else if ("workOSOrganizationId" in body) {
        await workspace.updateWorkspaceSettings({
          workOSOrganizationId: body.workOSOrganizationId,
        });
        owner.workOSOrganizationId = body.workOSOrganizationId;
      } else if ("allowContentCreationFileSharing" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          allowContentCreationFileSharing: body.allowContentCreationFileSharing,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;

        // if public sharing is disabled, downgrade share scope of all public files
        if (!body.allowContentCreationFileSharing) {
          await FileResource.revokePublicSharingInWorkspace(auth, {
            newPolicy: "workspace_and_emails",
          });
        }
      } else if ("sharingPolicy" in body) {
        await workspace.updateWorkspaceSettings({
          sharingPolicy: body.sharingPolicy,
        });

        // If the new policy restricts public sharing, downgrade existing public frames.
        if (body.sharingPolicy !== "all_scopes") {
          await FileResource.revokePublicSharingInWorkspace(auth, {
            newPolicy: body.sharingPolicy,
          });
        }
      } else if ("allowVoiceTranscription" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          allowVoiceTranscription: body.allowVoiceTranscription,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;
      } else if ("privateConversationUrlsByDefault" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          privateConversationUrlsByDefault:
            body.privateConversationUrlsByDefault,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;
      } else if ("allowEmailAgents" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          allowEmailAgents: body.allowEmailAgents,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;
      } else if ("allowReinforcement" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          allowReinforcement: body.allowReinforcement,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;

        void emitAuditLogEvent({
          auth,
          action: "self_improvement.enabled",
          targets: [buildAuditLogTarget("workspace", owner)],
          context: getAuditLogContext(auth, req),
          metadata: {
            enabled: String(body.allowReinforcement),
          },
        });
      } else if ("allowReinforcementBatchMode" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          allowReinforcementBatchMode: body.allowReinforcementBatchMode,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;

        void emitAuditLogEvent({
          auth,
          action: "self_improvement.batch_mode_updated",
          targets: [buildAuditLogTarget("workspace", owner)],
          context: getAuditLogContext(auth, req),
          metadata: {
            enabled: String(body.allowReinforcementBatchMode),
          },
        });
      } else if ("disableExtensionMcpTools" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          disableExtensionMcpTools: body.disableExtensionMcpTools,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;
      } else if ("allowOpenProjects" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          allowOpenProjects: body.allowOpenProjects,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;
      } else if ("allowManualProjectKnowledgeManagement" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          allowManualProjectKnowledgeManagement:
            body.allowManualProjectKnowledgeManagement,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;
      } else if ("reinforcementCapMicroUsd" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          reinforcementCapMicroUsd: body.reinforcementCapMicroUsd,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;
      } else if ("selfImprovementCapPerSkillMicroUsd" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          selfImprovementCapPerSkillMicroUsd:
            body.selfImprovementCapPerSkillMicroUsd,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;
      } else if ("sandboxAllowAgentEgressRequests" in body) {
        if (!(await hasFeatureFlag(auth, "sandbox_workspace_admin"))) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "feature_flag_not_found",
              message:
                "Sandbox workspace admin configuration is not enabled for this workspace.",
            },
          });
        }

        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          sandboxAllowAgentEgressRequests: body.sandboxAllowAgentEgressRequests,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;

        void emitAuditLogEvent({
          auth,
          action: "sandbox_egress_policy.agent_requests_setting_updated",
          targets: [
            buildAuditLogTarget("workspace", owner),
            {
              type: "sandbox_egress_policy",
              id: owner.sId,
              name: "Sandbox egress policy",
            },
          ],
          context: getAuditLogContext(auth, req),
          metadata: {
            enabled: String(body.sandboxAllowAgentEgressRequests),
          },
        });
      } else if ("disableAuditLogs" in body) {
        const previousMetadata = owner.metadata ?? {};
        const newMetadata = {
          ...previousMetadata,
          disableAuditLogs: body.disableAuditLogs,
        };
        await workspace.updateWorkspaceSettings({ metadata: newMetadata });
        owner.metadata = newMetadata;
        void emitAuditLogEvent({
          auth,
          action: "workspace.audit_logs_updated",
          targets: [buildAuditLogTarget("workspace", owner)],
          context: getAuditLogContext(auth, req),
          metadata: {
            enabled: String(!body.disableAuditLogs),
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
