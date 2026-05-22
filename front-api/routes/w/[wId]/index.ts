import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { renameWorkspace } from "@app/lib/api/workspace";
import { hasFeatureFlag } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { EmbeddingProviderSchema } from "@app/types/assistant/models/embedding";
import { ModelProviderIdSchema } from "@app/types/assistant/models/providers";
import type { WorkspaceType } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { workspaceAuth } from "@front-api/middlewares/workspace_auth";
import { escape } from "html-escaper";
import { z } from "zod";
import assistant from "./assistant";
import auditLogs from "./audit-logs";
import authContext from "./auth-context";
import builder from "./builder";
import coupon from "./coupon";
import credentials from "./credentials";
import credits from "./credits";
import dataSourceViews from "./data_source_views";
import dataSources from "./data_sources";
import dataClassificationLabels from "./data-classification-labels";
import domains from "./domains";
import dsync from "./dsync";
import dustAppSecrets from "./dust_app_secrets";
import extension from "./extension";
import featureFlags from "./feature-flags";
import files from "./files";
import groups from "./groups";
import invitations from "./invitations";
import keys from "./keys";
import labs from "./labs";
import mcp from "./mcp";
import me from "./me";
import members from "./members";
import metronome from "./metronome";
import models from "./models";
import projectTasks from "./project_tasks";
import providerCredentials from "./provider_credentials";
import providerCredential from "./provider_credentials/[providerId]";
import providers from "./providers";
import provisioningStatus from "./provisioning-status";
import sandbox from "./sandbox";
import search from "./search";
import seats from "./seats";
import services from "./services";
import skills from "./skills";
import spaces from "./spaces";
import sso from "./sso";
import subscriptions from "./subscriptions";
import tags from "./tags";
import trial from "./trial";
import trialMessageUsage from "./trial-message-usage";
import verification from "./verification";
import verifiedDomains from "./verified-domains";
import verify from "./verify";
import webhookSources from "./webhook_sources";
import welcome from "./welcome";
import workspaceAnalytics from "./workspace-analytics";
import workspaceUsage from "./workspace-usage";

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

const app = workspaceApp();

app.route("/auth-context", authContext);

app.use(
  "/feature-flags/*",
  workspaceAuth({ doesNotRequireCanUseProduct: true })
);
app.route("/feature-flags", featureFlags);

app.use("/welcome/*", workspaceAuth({ doesNotRequireCanUseProduct: true }));
app.route("/welcome", welcome);

app.use("/verify/*", workspaceAuth({ doesNotRequireCanUseProduct: true }));
app.route("/verify", verify);

app.use(
  "/trial-message-usage/*",
  workspaceAuth({ doesNotRequireCanUseProduct: true })
);
app.route("/trial-message-usage", trialMessageUsage);

app.use(
  "/coupon/validate/*",
  workspaceAuth({ doesNotRequireCanUseProduct: true })
);
app.route("/coupon", coupon);

app.use("/trial/start/*", workspaceAuth({ doesNotRequireCanUseProduct: true }));
app.route("/trial", trial);

// Why we do not collocate them with `app.route`? These sub-apps have a mix of
// override and non-override paths: overrides must run before the catch-all
// (`workspaceAuth` default = without the options would win otherwise), while
// the `app.route()` must sit below the catch-all so non-override sub-paths
// inherit the default.
app.use("/credits", workspaceAuth({ doesNotRequireCanUseProduct: true }));
app.use(
  "/credits/purchase",
  workspaceAuth({ doesNotRequireCanUseProduct: true })
);
app.use(
  "/verification/*",
  workspaceAuth({ doesNotRequireCanUseProduct: true })
);
app.use("/seats/count", workspaceAuth({ doesNotRequireCanUseProduct: true }));
app.use("/subscriptions", workspaceAuth({ doesNotRequireCanUseProduct: true }));
app.use(
  "/subscriptions/status/*",
  workspaceAuth({ doesNotRequireCanUseProduct: true })
);
app.use(
  "/subscriptions/checkout-status/*",
  workspaceAuth({ doesNotRequireCanUseProduct: true })
);
app.use(
  "/subscriptions/trial-info/*",
  workspaceAuth({ doesNotRequireCanUseProduct: true })
);
app.use(
  "/subscriptions/checkout/*",
  workspaceAuth({ doesNotRequireCanUseProduct: true })
);

// === Default auth for everything else.
app.use("*", workspaceAuth());

interface GetWorkspaceResponseBody {
  workspace: WorkspaceType;
}

app.get("/", async (ctx): HandlerResult<GetWorkspaceResponseBody> => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  return ctx.json({ workspace: owner });
});

app.post(
  "/",
  validate("json", PostWorkspaceRequestBodySchema),
  async (ctx): HandlerResult<GetWorkspaceResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    if (!auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can access this endpoint.",
        },
      });
    }

    const body = ctx.req.valid("json");

    const workspace = await WorkspaceResource.fetchByModelId(owner.id);
    if (!workspace) {
      return apiError(ctx, {
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
        return apiError(ctx, {
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
        privateConversationUrlsByDefault: body.privateConversationUrlsByDefault,
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
        context: getAuditLogContext(auth),
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
        context: getAuditLogContext(auth),
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
        return apiError(ctx, {
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
        context: getAuditLogContext(auth),
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
        context: getAuditLogContext(auth),
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
          return apiError(ctx, {
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
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: updateResult.error.message,
          },
        });
      }
    }

    return ctx.json({ workspace: owner });
  }
);

// Sub-apps using the catch-all default + the partial-subtree exception
// targets declared above.
app.route("/assistant", assistant);
app.route("/audit-logs", auditLogs);
app.route("/builder", builder);
app.route("/credentials", credentials);
app.route("/credits", credits);
app.route("/data-classification-labels", dataClassificationLabels);
app.route("/data_source_views", dataSourceViews);
app.route("/data_sources", dataSources);
app.route("/domains", domains);
app.route("/dsync", dsync);
app.route("/dust_app_secrets", dustAppSecrets);
app.route("/extension", extension);
app.route("/files", files);
app.route("/groups", groups);
app.route("/invitations", invitations);
app.route("/keys", keys);
app.route("/labs", labs);
app.route("/mcp", mcp);
app.route("/me", me);
app.route("/members", members);
app.route("/metronome", metronome);
app.route("/models", models);
app.route("/project_tasks", projectTasks);
app.route("/provider_credentials/:providerId", providerCredential);
app.route("/provider_credentials", providerCredentials);
app.route("/providers", providers);
app.route("/provisioning-status", provisioningStatus);
app.route("/sandbox", sandbox);
app.route("/search", search);
app.route("/seats", seats);
app.route("/services", services);
app.route("/skills", skills);
app.route("/sso", sso);
app.route("/spaces", spaces);
app.route("/subscriptions", subscriptions);
app.route("/tags", tags);
app.route("/verification", verification);
app.route("/verified-domains", verifiedDomains);
app.route("/webhook_sources", webhookSources);
app.route("/workspace-analytics", workspaceAnalytics);
app.route("/workspace-usage", workspaceUsage);

export default app;
