import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import { AgentDataSourceConfiguration } from "@app/lib/models/agent/actions/data_sources";
import { InternalMCPServerCredentialModel } from "@app/lib/models/agent/actions/internal_mcp_server_credentials";
import {
  AgentChildAgentConfiguration,
  AgentMCPActionModel,
  AgentMCPActionOutputItem,
  AgentMCPServerConfiguration,
} from "@app/lib/models/agent/actions/mcp";
import { MCPServerConnection } from "@app/lib/models/agent/actions/mcp_server_connection";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { AgentReasoningConfiguration } from "@app/lib/models/agent/actions/reasoning";
import { RemoteMCPServerModel } from "@app/lib/models/agent/actions/remote_mcp_server";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/agent/actions/tables_query";
import {
  AgentConfiguration,
  AgentUserRelation,
  GlobalAgentSettings,
} from "@app/lib/models/agent/agent";
import { AgentDataRetentionModel } from "@app/lib/models/agent/agent_data_retention";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessage,
  AgentMessageFeedback,
  ConversationModel,
  ConversationParticipantModel,
  Mention,
  Message,
  MessageReaction,
  UserMessage,
} from "@app/lib/models/agent/conversation";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { TriggerSubscriberModel } from "@app/lib/models/agent/triggers/trigger_subscriber";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import { WebhookRequestModel } from "@app/lib/models/agent/triggers/webhook_request";
import { WebhookRequestTriggerModel } from "@app/lib/models/agent/triggers/webhook_request_trigger";
import { WebhookSourceModel } from "@app/lib/models/agent/triggers/webhook_source";
import { WebhookSourcesViewModel } from "@app/lib/models/agent/triggers/webhook_sources_view";
import {
  TrackerConfigurationModel,
  TrackerDataSourceConfigurationModel,
  TrackerGenerationModel,
} from "@app/lib/models/doc_tracker";
import { DustAppSecret } from "@app/lib/models/dust_app_secret";
import { ExtensionConfigurationModel } from "@app/lib/models/extension";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { Plan, Subscription } from "@app/lib/models/plan";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { TagModel } from "@app/lib/models/tags";
import { AgentMemoryModel } from "@app/lib/resources/storage/models/agent_memories";
import {
  AppModel,
  Clone,
  Dataset,
  Provider,
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
import {
  RunModel,
  RunUsageModel,
} from "@app/lib/resources/storage/models/runs";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { TemplateModel } from "@app/lib/resources/storage/models/templates";
import {
  UserMetadataModel,
  UserModel,
} from "@app/lib/resources/storage/models/user";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import logger from "@app/logger/logger";
import { sendInitDbMessage } from "@app/types";

async function main() {
  await sendInitDbMessage({
    service: "front",
    logger: logger,
  });
  await UserModel.sync({ alter: true });
  await UserMetadataModel.sync({ alter: true });
  await WorkspaceModel.sync({ alter: true });
  await WorkspaceHasDomainModel.sync({ alter: true });
  await MembershipModel.sync({ alter: true });
  await MembershipInvitationModel.sync({ alter: true });
  await GroupModel.sync({ alter: true });
  await GroupMembershipModel.sync({ alter: true });
  await TagModel.sync({ alter: true });

  await SpaceModel.sync({ alter: true });
  await AppModel.sync({ alter: true });
  await Dataset.sync({ alter: true });
  await Provider.sync({ alter: true });
  await Clone.sync({ alter: true });
  await KeyModel.sync({ alter: true });
  await FileModel.sync({ alter: true });
  await ShareableFileModel.sync({ alter: true });
  await DustAppSecret.sync({ alter: true });
  await GroupSpaceModel.sync({ alter: true });

  await WebhookSourceModel.sync({ alter: true });
  await WebhookSourcesViewModel.sync({ alter: true });
  await TriggerModel.sync({ alter: true });
  await TriggerSubscriberModel.sync({ alter: true });
  await WebhookRequestModel.sync({ alter: true });
  await WebhookRequestTriggerModel.sync({ alter: true });

  await ConversationModel.sync({ alter: true });
  await ConversationParticipantModel.sync({ alter: true });

  await DataSourceModel.sync({ alter: true });
  await DataSourceViewModel.sync({ alter: true });

  await RunModel.sync({ alter: true });
  await RunUsageModel.sync({ alter: true });

  await TrackerConfigurationModel.sync({ alter: true });
  await TrackerDataSourceConfigurationModel.sync({ alter: true });
  await TrackerGenerationModel.sync({ alter: true });

  await ExtensionConfigurationModel.sync({ alter: true });

  await Plan.sync({ alter: true });
  await Subscription.sync({ alter: true });
  await TemplateModel.sync({ alter: true });
  await CreditModel.sync({ alter: true });
  await ProgrammaticUsageConfigurationModel.sync({ alter: true });

  await AgentConfiguration.sync({ alter: true });
  await AgentUserRelation.sync({ alter: true });
  await GlobalAgentSettings.sync({ alter: true });
  await TagAgentModel.sync({ alter: true });
  await GroupAgentModel.sync({ alter: true });

  await RemoteMCPServerModel.sync({ alter: true });
  await MCPServerViewModel.sync({ alter: true });
  await MCPServerConnection.sync({ alter: true });
  await RemoteMCPServerToolMetadataModel.sync({ alter: true });
  await InternalMCPServerCredentialModel.sync({ alter: true });

  await ConversationMCPServerViewModel.sync({ alter: true });

  await AgentMCPServerConfiguration.sync({ alter: true });
  await AgentTablesQueryConfigurationTable.sync({ alter: true });
  await AgentReasoningConfiguration.sync({ alter: true });

  await AgentDataSourceConfiguration.sync({ alter: true });

  await UserMessage.sync({ alter: true });
  await AgentMessage.sync({ alter: true });
  await AgentMessageFeedback.sync({ alter: true });
  await ContentFragmentModel.sync({ alter: true });
  await Message.sync({ alter: true });
  await MessageReaction.sync({ alter: true });
  await Mention.sync({ alter: true });

  await AgentDataRetentionModel.sync({ alter: true });
  await AgentStepContentModel.sync({ alter: true });
  await AgentMCPActionModel.sync({ alter: true });
  await AgentMCPActionOutputItem.sync({ alter: true });
  await AgentChildAgentConfiguration.sync({ alter: true });

  await FeatureFlag.sync({ alter: true });
  await KillSwitchModel.sync({ alter: true });

  await LabsTranscriptsConfigurationModel.sync({ alter: true });
  await LabsTranscriptsHistoryModel.sync({ alter: true });

  await PluginRunModel.sync({ alter: true });

  await AgentMemoryModel.sync({ alter: true });
  await OnboardingTaskModel.sync({ alter: true });

  await SkillConfigurationModel.sync({ alter: true });
  await GroupSkillModel.sync({ alter: true });
  await AgentSkillModel.sync({ alter: true });
  await SkillMCPServerConfigurationModel.sync({ alter: true });

  process.exit(0);
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
