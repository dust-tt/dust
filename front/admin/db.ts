import {
  AgentBrowseAction,
  AgentBrowseConfiguration,
} from "@app/lib/models/assistant/actions/browse";
import { AgentConversationIncludeFileAction } from "@app/lib/models/assistant/actions/conversation/include_file";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import {
  AgentDustAppRunAction,
  AgentDustAppRunConfiguration,
} from "@app/lib/models/assistant/actions/dust_app_run";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { MCPServerConnection } from "@app/lib/models/assistant/actions/mcp_server_connection";
import { MCPServerView } from "@app/lib/models/assistant/actions/mcp_server_view";
import {
  AgentProcessAction,
  AgentProcessConfiguration,
} from "@app/lib/models/assistant/actions/process";
import {
  AgentReasoningAction,
  AgentReasoningConfiguration,
} from "@app/lib/models/assistant/actions/reasoning";
import { RemoteMCPServer } from "@app/lib/models/assistant/actions/remote_mcp_server";
import {
  AgentRetrievalAction,
  AgentRetrievalConfiguration,
  RetrievalDocument,
  RetrievalDocumentChunk,
} from "@app/lib/models/assistant/actions/retrieval";
import { AgentSearchLabelsAction } from "@app/lib/models/assistant/actions/search_labels";
import {
  AgentTablesQueryAction,
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import {
  AgentWebsearchAction,
  AgentWebsearchConfiguration,
} from "@app/lib/models/assistant/actions/websearch";
import {
  AgentConfiguration,
  AgentUserRelation,
  GlobalAgentSettings,
} from "@app/lib/models/assistant/agent";
import { AgentMessageContent } from "@app/lib/models/assistant/agent_message_content";
import {
  AgentMessage,
  AgentMessageFeedback,
  ConversationModel,
  ConversationParticipantModel,
  Mention,
  Message,
  MessageReaction,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import {
  TrackerConfigurationModel,
  TrackerDataSourceConfigurationModel,
  TrackerGenerationModel,
} from "@app/lib/models/doc_tracker";
import { DustAppSecret } from "@app/lib/models/dust_app_secret";
import { ExtensionConfigurationModel } from "@app/lib/models/extension";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import { MembershipInvitation } from "@app/lib/models/membership_invitation";
import { Plan, Subscription } from "@app/lib/models/plan";
import { Workspace } from "@app/lib/models/workspace";
import { WorkspaceHasDomain } from "@app/lib/models/workspace_has_domain";
import {
  AppModel,
  Clone,
  Dataset,
  Provider,
} from "@app/lib/resources/storage/models/apps";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { FileModel } from "@app/lib/resources/storage/models/files";
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
import { PluginRunModel } from "@app/lib/resources/storage/models/plugin_runs";
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
import logger from "@app/logger/logger";
import { sendInitDbMessage } from "@app/types";

async function main() {
  await sendInitDbMessage({
    service: "front",
    logger: logger,
  });
  await UserModel.sync({ alter: true });
  await UserMetadataModel.sync({ alter: true });
  await Workspace.sync({ alter: true });
  await WorkspaceHasDomain.sync({ alter: true });
  await MembershipModel.sync({ alter: true });
  await MembershipInvitation.sync({ alter: true });
  await GroupModel.sync({ alter: true });
  await GroupMembershipModel.sync({ alter: true });

  await SpaceModel.sync({ alter: true });
  await AppModel.sync({ alter: true });
  await Dataset.sync({ alter: true });
  await Provider.sync({ alter: true });
  await Clone.sync({ alter: true });
  await KeyModel.sync({ alter: true });
  await FileModel.sync({ alter: true });
  await DustAppSecret.sync({ alter: true });
  await GroupSpaceModel.sync({ alter: true });

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

  await AgentConfiguration.sync({ alter: true });
  await AgentUserRelation.sync({ alter: true });
  await GlobalAgentSettings.sync({ alter: true });

  await RemoteMCPServer.sync({ alter: true });
  await MCPServerView.sync({ alter: true });
  await MCPServerConnection.sync({ alter: true });

  await AgentRetrievalConfiguration.sync({ alter: true });
  await AgentDustAppRunConfiguration.sync({ alter: true });
  await AgentTablesQueryConfiguration.sync({ alter: true });
  await AgentTablesQueryConfigurationTable.sync({ alter: true });
  await AgentProcessConfiguration.sync({ alter: true });
  await AgentWebsearchConfiguration.sync({ alter: true });
  await AgentBrowseConfiguration.sync({ alter: true });
  await AgentReasoningConfiguration.sync({ alter: true });
  await AgentMCPServerConfiguration.sync({ alter: true });

  await AgentDataSourceConfiguration.sync({ alter: true });

  await UserMessage.sync({ alter: true });
  await AgentMessage.sync({ alter: true });
  await AgentMessageFeedback.sync({ alter: true });
  await ContentFragmentModel.sync({ alter: true });
  await Message.sync({ alter: true });
  await MessageReaction.sync({ alter: true });
  await Mention.sync({ alter: true });

  await AgentBrowseAction.sync({ alter: true });
  await AgentConversationIncludeFileAction.sync({ alter: true });
  await AgentDustAppRunAction.sync({ alter: true });
  await AgentMessageContent.sync({ alter: true });
  await AgentProcessAction.sync({ alter: true });
  await AgentReasoningAction.sync({ alter: true });
  await AgentRetrievalAction.sync({ alter: true });
  await AgentSearchLabelsAction.sync({ alter: true });
  await AgentTablesQueryAction.sync({ alter: true });
  await AgentWebsearchAction.sync({ alter: true });
  await AgentMCPAction.sync({ alter: true });
  await AgentMCPActionOutputItem.sync({ alter: true });
  await RetrievalDocument.sync({ alter: true });
  await RetrievalDocumentChunk.sync({ alter: true });

  await FeatureFlag.sync({ alter: true });
  await KillSwitchModel.sync({ alter: true });

  // Labs - Can be removed at all times if a solution is dropped
  await LabsTranscriptsConfigurationModel.sync({ alter: true });
  await LabsTranscriptsHistoryModel.sync({ alter: true });

  await PluginRunModel.sync({ alter: true });

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
