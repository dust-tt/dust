import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import { InternalMCPServerCredentialModel } from "@app/lib/models/agent/actions/internal_mcp_server_credentials";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { AgentProjectConfigurationModel } from "@app/lib/models/agent/actions/projects";
import { RemoteMCPServerModel } from "@app/lib/models/agent/actions/remote_mcp_server";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import {
  AgentConfigurationModel,
  AgentUserRelationModel,
  GlobalAgentSettingsModel,
} from "@app/lib/models/agent/agent";
import { AgentDataRetentionModel } from "@app/lib/models/agent/agent_data_retention";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import {
  AgentMessageFeedbackModel,
  AgentMessageModel,
  ConversationModel,
  ConversationParticipantModel,
  MentionModel,
  MessageModel,
  MessageReactionModel,
  UserConversationReadsModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { TriggerSubscriberModel } from "@app/lib/models/agent/triggers/trigger_subscriber";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { WebhookRequestModel } from "@app/lib/models/agent/triggers/webhook_request";
import { WebhookRequestTriggerModel } from "@app/lib/models/agent/triggers/webhook_request_trigger";
import { WebhookSourceModel } from "@app/lib/models/agent/triggers/webhook_source";
import { WebhookSourcesViewModel } from "@app/lib/models/agent/triggers/webhook_sources_view";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import { ExtensionConfigurationModel } from "@app/lib/models/extension";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import {
  SkillConfigurationModel,
  SkillDataSourceConfigurationModel,
  SkillMCPServerConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import {
  AgentMessageSkillModel,
  ConversationSkillModel,
} from "@app/lib/models/skill/conversation_skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { TagModel } from "@app/lib/models/tags";
import { AgentMemoryModel } from "@app/lib/resources/storage/models/agent_memories";
import { AgentMessageCitationsModel } from "@app/lib/resources/storage/models/agent_message_citations";
import {
  AppModel,
  CloneModel,
  DatasetModel,
  ProviderModel,
} from "@app/lib/resources/storage/models/apps";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { CreditModel } from "@app/lib/resources/storage/models/credits";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import {
  FileModel,
  ShareableFileModel,
} from "@app/lib/resources/storage/models/files";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { KillSwitchModel } from "@app/lib/resources/storage/models/kill_switches";
// Labs - Can be removed at all times if a solution is dropped
import {
  LabsTranscriptsConfigurationModel,
  LabsTranscriptsHistoryModel,
} from "@app/lib/resources/storage/models/labs_transcripts";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { OnboardingTaskModel } from "@app/lib/resources/storage/models/onboarding_tasks";
import { PluginRunModel } from "@app/lib/resources/storage/models/plugin_runs";
import { ProgrammaticUsageConfigurationModel } from "@app/lib/resources/storage/models/programmatic_usage_configurations";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import {
  RunModel,
  RunUsageModel,
} from "@app/lib/resources/storage/models/runs";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { TemplateModel } from "@app/lib/resources/storage/models/templates";
import {
  UserMetadataModel,
  UserModel,
  UserToolApprovalModel,
} from "@app/lib/resources/storage/models/user";
import { UserProjectDigestModel } from "@app/lib/resources/storage/models/user_project_digest";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { WorkspaceVerificationAttemptModel } from "@app/lib/resources/storage/models/workspace_verification_attempt";
import logger from "@app/logger/logger";
import { sendInitDbMessage } from "@app/types/shared/deployment";

/**
 * Loads all Sequelize models, useful for some tests
 * ⚠️ Order matters here.
 */
export function loadAllModels() {
  return [
    UserModel,
    WorkspaceModel,
    UserMetadataModel,
    WorkspaceHasDomainModel,
    MembershipModel,
    MembershipInvitationModel,
    GroupModel,
    GroupMembershipModel,
    TagModel,
    SpaceModel,
    ProjectMetadataModel,
    AppModel,
    DatasetModel,
    ProviderModel,
    CloneModel,
    KeyModel,
    FileModel,
    ShareableFileModel,
    DustAppSecretModel,
    GroupSpaceModel,
    WebhookSourceModel,
    WebhookSourcesViewModel,
    TriggerModel,
    TriggerSubscriberModel,
    WebhookRequestModel,
    WebhookRequestTriggerModel,
    ConversationModel,
    ConversationParticipantModel,
    UserConversationReadsModel,
    DataSourceModel,
    DataSourceViewModel,
    RunModel,
    RunUsageModel,
    ExtensionConfigurationModel,
    PlanModel,
    SubscriptionModel,
    TemplateModel,
    CreditModel,
    ProgrammaticUsageConfigurationModel,
    AgentConfigurationModel,
    AgentUserRelationModel,
    GlobalAgentSettingsModel,
    TagAgentModel,
    GroupAgentModel,
    RemoteMCPServerModel,
    MCPServerViewModel,
    MCPServerConnectionModel,
    RemoteMCPServerToolMetadataModel,
    InternalMCPServerCredentialModel,
    ConversationMCPServerViewModel,
    AgentMCPServerConfigurationModel,
    AgentTablesQueryConfigurationTableModel,
    AgentDataSourceConfigurationModel,
    AgentProjectConfigurationModel,
    UserMessageModel,
    AgentMessageModel,
    AgentMessageFeedbackModel,
    ContentFragmentModel,
    MessageModel,
    MessageReactionModel,
    MentionModel,
    AgentDataRetentionModel,
    AgentStepContentModel,
    AgentMCPActionModel,
    AgentMCPActionOutputItemModel,
    AgentMessageCitationsModel,
    AgentChildAgentConfigurationModel,
    FeatureFlagModel,
    KillSwitchModel,
    LabsTranscriptsConfigurationModel,
    LabsTranscriptsHistoryModel,
    PluginRunModel,
    AgentMemoryModel,
    OnboardingTaskModel,
    UserToolApprovalModel,
    SkillConfigurationModel,
    SkillDataSourceConfigurationModel,
    SkillVersionModel,
    GroupSkillModel,
    AgentSkillModel,
    ConversationSkillModel,
    AgentMessageSkillModel,
    SkillMCPServerConfigurationModel,
    WorkspaceVerificationAttemptModel,
    AgentSuggestionModel,
    UserProjectDigestModel,
  ];
}

async function main() {
  await sendInitDbMessage({
    service: "front",
    logger: logger,
  });

  for (const model of loadAllModels()) {
    await model.sync({ alter: true });
  }

  // Seed pro plans so they're available before parallel test workers start.
  // This avoids deadlocks from concurrent upserts in WorkspaceFactory.
  const { upsertProPlans } = await import("@app/lib/plans/pro_plans");
  await upsertProPlans();

  process.exit(0);
}

// Only run main when executed directly (e.g., `npx tsx admin/db.ts`),
// not when imported as a module (e.g., in tests importing `loadAllModels`).
if (process.argv[1]?.includes("admin/db")) {
  main()
    .then(() => {
      console.log("Done");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
