import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  MAX_INACTIVITY_THRESHOLD_DAYS,
  MIN_INACTIVITY_THRESHOLD_DAYS,
} from "@app/lib/api/assistant/inactivity/policy";
import { listActiveAgentsUsingNonRegionalModels } from "@app/lib/api/assistant/workspace_capabilities";
import {
  buildAuditActor,
  buildAuditLogTarget,
  emitAuditLogEvent,
  emitAuditLogEventDirect,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { validateDustMcpServerAllowedRedirectUris } from "@app/lib/api/mcp_server/dust_mcp_server_settings";
import type { GetWorkspaceResponseBody } from "@app/lib/api/workspace";
import {
  renameWorkspace,
  updateWorkspaceMetadata,
} from "@app/lib/api/workspace";
import { getFeatureFlags, hasFeatureFlag } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { EmbeddingProviderSchema } from "@app/types/assistant/models/embedding";
import { ModelProviderIdSchema } from "@app/types/assistant/models/providers";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { workspaceAuth } from "@front-api/middlewares/workspace_auth";
import { escape } from "html-escaper";
import { z } from "zod";
import activationPod from "./activation-pod";
import actionRecommendations from "./activation-recommendations";
import activationWorkAreas from "./activation-work-areas";
import analytics from "./analytics";
import assistant from "./assistant";
import auditLogs from "./audit-logs";
import authContext from "./auth-context";
import billing from "./billing";
import branding from "./branding";
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
import fairUseCredits from "./fair-use-credits";
import featureFlags from "./feature-flags";
import files from "./files";
import frames from "./frames";
import googleDrivePickerToken from "./google_drive/picker_token";
import googleDriveSearchForAuthorization from "./google_drive/search_for_authorization";
import governancePermissions from "./governance-permissions";
import groups from "./groups";
import invitations from "./invitations";
import keys from "./keys";
import labs from "./labs";
import mcp from "./mcp";
import me from "./me";
import members from "./members";
import metronome from "./metronome";
import modelTiers from "./model_tiers";
import models from "./models";
import oauthSetup from "./oauth/[provider]/setup";
import permissions from "./permissions";
import pods from "./pods";
import projectTasks from "./project_tasks";
import providerCredentials from "./provider_credentials";
import providerCredential from "./provider_credentials/[providerId]";
import providers from "./providers";
import provisioningStatus from "./provisioning-status";
import sandbox from "./sandbox";
import sandboxFunctions from "./sandbox-functions";
import search from "./search";
import searchToolsUpload from "./search/tools/upload";
import seats from "./seats";
import services from "./services";
import skills from "./skills";
import slackWorkflows from "./slack-workflows";
import spaces from "./spaces";
import sso from "./sso";
import subscriptions from "./subscriptions";
import tags from "./tags";
import trial from "./trial";
import trialMessageUsage from "./trial-message-usage";
import triggers from "./triggers";
import usageSettings from "./usage_settings";
import usageStatus from "./usage-status";
import verification from "./verification";
import verifiedDomains from "./verified-domains";
import verify from "./verify";
import webhookSources from "./webhook_sources";
import welcome from "./welcome";
import workspaceAnalytics from "./workspace-analytics";

const WorkspaceNameUpdateBodySchema = z.object({
  name: z.string(),
});

const WorkspaceRegionalModelsOnlyUpdateBodySchema = z.object({
  regionalModelsOnly: z.boolean(),
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

const WorkspaceConversationExternalNotificationsUpdateBodySchema = z.object({
  allowConversationExternalNotifications: z.boolean(),
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

const WorkspaceDustMcpServerSettingsUpdateBodySchema = z.object({
  dustMcpServerSettings: z.object({
    disabled: z.boolean(),
    acceptAllRedirectUris: z.boolean(),
    allowedRedirectUris: z.array(z.string()),
  }),
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

// Same caps in AWU credits, used for workspaces billed by Metronome.
const WorkspaceReinforcementCapAwuCreditsUpdateBodySchema = z.object({
  reinforcementCapAwuCredits: z.number(),
});

const WorkspaceSelfImprovementCapPerSkillAwuCreditsUpdateBodySchema = z.object({
  selfImprovementCapPerSkillAwuCredits: z.number(),
});

const WorkspaceAuditLogsUpdateBodySchema = z.object({
  disableAuditLogs: z.boolean(),
});

const WorkspaceAnalyticsUpdateBodySchema = z.object({
  disableWorkspaceAnalytics: z.boolean(),
});

const WorkspacePublishedAgentsRestrictedModelsUpdateBodySchema = z.object({
  allowRestrictedModelsForPublishedAgents: z.boolean(),
});

const WorkspaceSlackPersonalFooterRemovalUpdateBodySchema = z.object({
  slackPersonalAllowFooterRemoval: z.boolean(),
});

// A null value clears the workspace-wide default agent (falls back to @dust).
const WorkspaceDefaultAgentUpdateBodySchema = z.object({
  workspaceDefaultAgentId: z.string().nullable(),
});

const WorkspaceInactiveAgentArchivalUpdateBodySchema = z.object({
  // Null turns automatic archival off: the policy is opt-in and has no default threshold.
  inactiveAgentArchivalThresholdDays: z
    .number()
    .int()
    .min(MIN_INACTIVITY_THRESHOLD_DAYS)
    .max(MAX_INACTIVITY_THRESHOLD_DAYS)
    .nullable(),
});

const PostWorkspaceRequestBodySchema = z.union([
  WorkspaceInactiveAgentArchivalUpdateBodySchema,
  WorkspaceNameUpdateBodySchema,
  WorkspaceRegionalModelsOnlyUpdateBodySchema,
  WorkspaceProvidersUpdateBodySchema,
  WorkspaceWorkOSUpdateBodySchema,
  WorkspaceInteractiveContentSharingUpdateBodySchema,
  WorkspaceSharingPolicyUpdateBodySchema,
  WorkspaceVoiceTranscriptionUpdateBodySchema,
  WorkspacePrivateConversationUrlsUpdateBodySchema,
  WorkspaceEmailAgentsUpdateBodySchema,
  WorkspaceConversationExternalNotificationsUpdateBodySchema,
  WorkspaceAgentReinforcementUpdateBodySchema,
  WorkspaceReinforcementBatchModeUpdateBodySchema,
  WorkspaceExtensionMcpToolsUpdateBodySchema,
  WorkspaceDustMcpServerSettingsUpdateBodySchema,
  WorkspaceOpenProjectsUpdateBodySchema,
  WorkspaceManualProjectKnowledgeManagementUpdateBodySchema,
  WorkspaceSandboxAgentEgressRequestsUpdateBodySchema,
  WorkspaceReinforcementCapUpdateBodySchema,
  WorkspaceSelfImprovementCapPerSkillUpdateBodySchema,
  WorkspaceReinforcementCapAwuCreditsUpdateBodySchema,
  WorkspaceSelfImprovementCapPerSkillAwuCreditsUpdateBodySchema,
  WorkspaceAuditLogsUpdateBodySchema,
  WorkspaceAnalyticsUpdateBodySchema,
  WorkspacePublishedAgentsRestrictedModelsUpdateBodySchema,
  WorkspaceDefaultAgentUpdateBodySchema,
  WorkspaceSlackPersonalFooterRemovalUpdateBodySchema,
]);

const app = workspaceApp();

app.use(
  "/auth-context/*",
  workspaceAuth({
    doesNotRequireCanUseProduct: true,
    allowMissingWorkspace: true,
  })
);
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

app.use("/coupon/*", workspaceAuth({ doesNotRequireCanUseProduct: true }));
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
app.use(
  "/usage-status/*",
  workspaceAuth({ doesNotRequireCanUseProduct: true })
);
app.use(
  "/fair-use-credits/*",
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

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetWorkspaceResponseBody> => {
    const owner = ctx.get("auth").getNonNullableWorkspace();

    return ctx.json({ workspace: owner });
  }
);

app.post(
  "/",
  ensureIsAdmin(),
  validate("json", PostWorkspaceRequestBodySchema),
  async (ctx): HandlerResult<GetWorkspaceResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

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
      const previousName = owner.name;
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

      void emitAuditLogEvent({
        auth,
        action: "workspace.name_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          previous_name: previousName,
          new_name: newName,
        },
      });
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
          return apiError(ctx, {
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

      void emitAuditLogEvent({
        auth,
        action: "workspace.regional_models_only_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(body.regionalModelsOnly),
        },
      });
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

      void emitAuditLogEvent({
        auth,
        action: "workspace.model_provider_settings_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled_providers: body.whiteListedProviders.join(","),
          default_embedding_provider: body.defaultEmbeddingProvider ?? "",
        },
      });
    } else if ("workOSOrganizationId" in body) {
      const previousWorkOSOrganizationId = owner.workOSOrganizationId;
      await workspace.updateWorkspaceSettings({
        workOSOrganizationId: body.workOSOrganizationId,
      });

      const auditWorkspace = {
        ...owner,
        workOSOrganizationId:
          body.workOSOrganizationId ?? previousWorkOSOrganizationId,
      };
      void emitAuditLogEventDirect({
        workspace: auditWorkspace,
        action: "workspace.workos_organization_updated",
        actor: buildAuditActor(auth),
        targets: [buildAuditLogTarget("workspace", auditWorkspace)],
        context: getAuditLogContext(auth),
        metadata: {
          configured: String(body.workOSOrganizationId !== null),
          organization_id: body.workOSOrganizationId ?? "",
        },
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

      void emitAuditLogEvent({
        auth,
        action: "workspace.interactive_content_sharing_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(body.allowContentCreationFileSharing),
        },
      });

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

      void emitAuditLogEvent({
        auth,
        action: "workspace.sharing_policy_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          policy: body.sharingPolicy,
        },
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

      void emitAuditLogEvent({
        auth,
        action: "workspace.voice_transcription_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(body.allowVoiceTranscription),
        },
      });
    } else if ("privateConversationUrlsByDefault" in body) {
      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        privateConversationUrlsByDefault: body.privateConversationUrlsByDefault,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;

      void emitAuditLogEvent({
        auth,
        action: "workspace.private_conversation_urls_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(body.privateConversationUrlsByDefault),
        },
      });
    } else if ("allowEmailAgents" in body) {
      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        allowEmailAgents: body.allowEmailAgents,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;

      void emitAuditLogEvent({
        auth,
        action: "workspace.email_agents_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(body.allowEmailAgents),
        },
      });
    } else if ("allowRestrictedModelsForPublishedAgents" in body) {
      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        allowRestrictedModelsForPublishedAgents:
          body.allowRestrictedModelsForPublishedAgents,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;

      void emitAuditLogEvent({
        auth,
        action: "workspace.published_agents_restricted_models_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(body.allowRestrictedModelsForPublishedAgents),
        },
      });
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

      void emitAuditLogEvent({
        auth,
        action: "workspace.extension_mcp_tools_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(!body.disableExtensionMcpTools),
        },
      });
    } else if ("dustMcpServerSettings" in body) {
      const { dustMcpServerSettings } = body;

      if (
        !dustMcpServerSettings.disabled &&
        !dustMcpServerSettings.acceptAllRedirectUris
      ) {
        const validation = validateDustMcpServerAllowedRedirectUris(
          dustMcpServerSettings.allowedRedirectUris
        );
        if (validation.isErr()) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: validation.error.message,
            },
          });
        }
        dustMcpServerSettings.allowedRedirectUris = validation.value;
      }

      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        dustMcpServerDisabled: dustMcpServerSettings.disabled,
        dustMcpServerAcceptAllRedirectUris:
          dustMcpServerSettings.acceptAllRedirectUris,
        dustMcpServerAllowedRedirectUris:
          dustMcpServerSettings.allowedRedirectUris,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;

      void emitAuditLogEvent({
        auth,
        action: "dust_mcp_server.settings_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          disabled: String(dustMcpServerSettings.disabled),
          accept_all_redirect_uris: String(
            dustMcpServerSettings.acceptAllRedirectUris
          ),
          allowed_redirect_uris:
            dustMcpServerSettings.allowedRedirectUris.join(","),
        },
      });
    } else if ("allowOpenProjects" in body) {
      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        allowOpenProjects: body.allowOpenProjects,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;

      void emitAuditLogEvent({
        auth,
        action: "workspace.open_projects_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(body.allowOpenProjects),
        },
      });
    } else if ("allowManualProjectKnowledgeManagement" in body) {
      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        allowManualProjectKnowledgeManagement:
          body.allowManualProjectKnowledgeManagement,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;

      void emitAuditLogEvent({
        auth,
        action: "workspace.manual_project_knowledge_management_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(body.allowManualProjectKnowledgeManagement),
        },
      });
    } else if ("reinforcementCapMicroUsd" in body) {
      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        reinforcementCapMicroUsd: body.reinforcementCapMicroUsd,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;

      void emitAuditLogEvent({
        auth,
        action: "workspace.reinforcement_cap_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          cap_micro_usd: String(body.reinforcementCapMicroUsd),
          cap_awu_credits: String(
            previousMetadata.reinforcementCapAwuCredits ?? ""
          ),
        },
      });
    } else if ("selfImprovementCapPerSkillMicroUsd" in body) {
      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        selfImprovementCapPerSkillMicroUsd:
          body.selfImprovementCapPerSkillMicroUsd,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;

      void emitAuditLogEvent({
        auth,
        action: "workspace.self_improvement_cap_per_skill_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          cap_micro_usd: String(body.selfImprovementCapPerSkillMicroUsd),
          cap_awu_credits: String(
            previousMetadata.selfImprovementCapPerSkillAwuCredits ?? ""
          ),
        },
      });
    } else if ("reinforcementCapAwuCredits" in body) {
      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        reinforcementCapAwuCredits: body.reinforcementCapAwuCredits,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;

      void emitAuditLogEvent({
        auth,
        action: "workspace.reinforcement_cap_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          cap_micro_usd: String(
            previousMetadata.reinforcementCapMicroUsd ?? ""
          ),
          cap_awu_credits: String(body.reinforcementCapAwuCredits),
        },
      });
    } else if ("selfImprovementCapPerSkillAwuCredits" in body) {
      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        selfImprovementCapPerSkillAwuCredits:
          body.selfImprovementCapPerSkillAwuCredits,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;

      void emitAuditLogEvent({
        auth,
        action: "workspace.self_improvement_cap_per_skill_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          cap_micro_usd: String(
            previousMetadata.selfImprovementCapPerSkillMicroUsd ?? ""
          ),
          cap_awu_credits: String(body.selfImprovementCapPerSkillAwuCredits),
        },
      });
    } else if ("sandboxAllowAgentEgressRequests" in body) {
      const featureFlags = await getFeatureFlags(auth);
      if (!isComputerFeatureEnabled(featureFlags)) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "feature_flag_not_found",
            message: "Computer is disabled for this workspace.",
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

      const auditWorkspace = {
        ...owner,
        metadata: body.disableAuditLogs ? previousMetadata : newMetadata,
      };
      void emitAuditLogEventDirect({
        workspace: auditWorkspace,
        action: "workspace.audit_logs_updated",
        actor: buildAuditActor(auth),
        targets: [buildAuditLogTarget("workspace", auditWorkspace)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(!body.disableAuditLogs),
        },
      });
    } else if ("disableWorkspaceAnalytics" in body) {
      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        disableWorkspaceAnalytics: body.disableWorkspaceAnalytics,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;
      void emitAuditLogEvent({
        auth,
        action: "workspace.analytics_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(!body.disableWorkspaceAnalytics),
        },
      });
    } else if ("inactiveAgentArchivalThresholdDays" in body) {
      if (!(await hasFeatureFlag(auth, "archive_inactive_agents"))) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "The archive_inactive_agents feature is not enabled.",
          },
        });
      }

      // Null clears it, which is how the workspace turns automatic archival off.
      const inactiveAgentArchivalThresholdDays =
        body.inactiveAgentArchivalThresholdDays ?? undefined;
      const updateRes = await updateWorkspaceMetadata(owner, {
        inactiveAgentArchivalThresholdDays,
      });
      if (updateRes.isErr()) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: updateRes.error.message,
          },
        });
      }

      void emitAuditLogEvent({
        auth,
        action: "workspace.inactive_agent_archival_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          threshold_days: inactiveAgentArchivalThresholdDays
            ? String(inactiveAgentArchivalThresholdDays)
            : "disabled",
        },
      });
    } else if ("workspaceDefaultAgentId" in body) {
      if (!(await hasFeatureFlag(auth, "workspace_default_agent"))) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "feature_flag_not_found",
            message:
              "The workspace default agent feature is not enabled for this workspace.",
          },
        });
      }

      // Validate the default agent exists and is usable (handles both global
      // agents and workspace agents). A null value clears the default (@dust).
      if (body.workspaceDefaultAgentId) {
        const agent = await getAgentConfiguration(auth, {
          agentId: body.workspaceDefaultAgentId,
          variant: "extra_light",
        });
        if (!agent || agent.status !== "active") {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Agent "${body.workspaceDefaultAgentId}" was not found or is not usable by the authenticated user.`,
            },
          });
        }
      }

      const workspaceDefaultAgentId = body.workspaceDefaultAgentId ?? undefined;
      const updateRes = await updateWorkspaceMetadata(owner, {
        workspaceDefaultAgentId,
      });
      if (updateRes.isErr()) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: updateRes.error.message,
          },
        });
      }
      owner.metadata = {
        ...(owner.metadata ?? {}),
        workspaceDefaultAgentId,
      };

      void emitAuditLogEvent({
        auth,
        action: "workspace.default_agent_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          agent_id: workspaceDefaultAgentId ?? "dust",
        },
      });
    } else if ("slackPersonalAllowFooterRemoval" in body) {
      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        slackPersonalAllowFooterRemoval: body.slackPersonalAllowFooterRemoval,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;

      void emitAuditLogEvent({
        auth,
        action: "workspace.slack_personal_footer_removal_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(body.slackPersonalAllowFooterRemoval),
        },
      });
    } else if ("allowConversationExternalNotifications" in body) {
      const previousMetadata = owner.metadata ?? {};
      const newMetadata = {
        ...previousMetadata,
        allowConversationExternalNotifications:
          body.allowConversationExternalNotifications,
      };
      await workspace.updateWorkspaceSettings({ metadata: newMetadata });
      owner.metadata = newMetadata;

      void emitAuditLogEvent({
        auth,
        action: "workspace.conversation_external_notifications_updated",
        targets: [buildAuditLogTarget("workspace", owner)],
        context: getAuditLogContext(auth),
        metadata: {
          enabled: String(body.allowConversationExternalNotifications),
        },
      });
    }

    return ctx.json({ workspace: owner });
  }
);

// Sub-apps using the catch-all default + the partial-subtree exception
// targets declared above.
app.route("/activation-recommendations", actionRecommendations);
app.route("/activation-work-areas", activationWorkAreas);
app.route("/activation-pod", activationPod);
app.route("/analytics", analytics);
app.route("/model_tiers", modelTiers);
app.route("/assistant", assistant);
app.route("/audit-logs", auditLogs);
app.route("/billing", billing);
app.route("/branding", branding);
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
app.route("/fair-use-credits", fairUseCredits);
app.route("/files", files);
app.route("/frames", frames);
app.route("/google_drive/picker_token", googleDrivePickerToken);
app.route(
  "/google_drive/search_for_authorization",
  googleDriveSearchForAuthorization
);
app.route("/governance-permissions", governancePermissions);
app.route("/groups", groups);
app.route("/invitations", invitations);
app.route("/keys", keys);
app.route("/labs", labs);
app.route("/mcp", mcp);
app.route("/me", me);
app.route("/members", members);
app.route("/metronome", metronome);
app.route("/models", models);
app.route("/oauth/:provider/setup", oauthSetup);
app.route("/pods", pods);
app.route("/usage-status", usageStatus);
app.route("/permissions", permissions);
app.route("/project_tasks", projectTasks);
app.route("/provider_credentials/:providerId", providerCredential);
app.route("/provider_credentials", providerCredentials);
app.route("/providers", providers);
app.route("/provisioning-status", provisioningStatus);
app.route("/sandbox", sandbox);
app.route("/sandbox-functions", sandboxFunctions);
app.route("/search", search);
app.route("/search/tools/upload", searchToolsUpload);
app.route("/seats", seats);
app.route("/services", services);
app.route("/skills", skills);
app.route("/sso", sso);
app.route("/slack-workflows", slackWorkflows);
app.route("/spaces", spaces);
app.route("/subscriptions", subscriptions);
app.route("/tags", tags);
app.route("/triggers", triggers);
app.route("/usage_settings", usageSettings);
app.route("/verification", verification);
app.route("/verified-domains", verifiedDomains);
app.route("/webhook_sources", webhookSources);
app.route("/workspace-analytics", workspaceAnalytics);

export default app;
