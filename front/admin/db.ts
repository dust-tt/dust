import { sendInitDbMessage } from "@dust-tt/types";

import {
  AgentBrowseAction,
  AgentBrowseConfiguration,
} from "@app/lib/models/assistant/actions/browse";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import {
  AgentDustAppRunAction,
  AgentDustAppRunConfiguration,
} from "@app/lib/models/assistant/actions/dust_app_run";
import {
  AgentProcessAction,
  AgentProcessConfiguration,
} from "@app/lib/models/assistant/actions/process";
import {
  AgentRetrievalAction,
  AgentRetrievalConfiguration,
  RetrievalDocument,
  RetrievalDocumentChunk,
} from "@app/lib/models/assistant/actions/retrieval";
import {
  AgentTablesQueryAction,
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import {
  AgentVisualizationAction,
  AgentVisualizationConfiguration,
} from "@app/lib/models/assistant/actions/visualization";
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
  Conversation,
  ConversationParticipant,
  Mention,
  Message,
  MessageReaction,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { ConversationClassification } from "@app/lib/models/conversation_classification";
import {
  DocumentTrackerChangeSuggestion,
  TrackedDocument,
} from "@app/lib/models/doc_tracker";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import { Plan, Subscription } from "@app/lib/models/plan";
import { User, UserMetadata } from "@app/lib/models/user";
import {
  DustAppSecret,
  MembershipInvitation,
  Workspace,
  WorkspaceHasDomain,
} from "@app/lib/models/workspace";
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
import { GroupVaultModel } from "@app/lib/resources/storage/models/group_vaults";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
// Labs - Can be removed at all times if a solution is dropped
import {
  LabsTranscriptsConfigurationModel,
  LabsTranscriptsHistoryModel,
} from "@app/lib/resources/storage/models/labs_transcripts";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import {
  RunModel,
  RunUsageModel,
} from "@app/lib/resources/storage/models/runs";
import { TemplateModel } from "@app/lib/resources/storage/models/templates";
import { VaultModel } from "@app/lib/resources/storage/models/vaults";
import logger from "@app/logger/logger";

async function main() {
  await sendInitDbMessage({
    service: "front",
    logger: logger,
  });
  await User.sync({ alter: true });
  await UserMetadata.sync({ alter: true });
  await Workspace.sync({ alter: true });
  await WorkspaceHasDomain.sync({ alter: true });
  await MembershipModel.sync({ alter: true });
  await MembershipInvitation.sync({ alter: true });
  await GroupModel.sync({ alter: true });
  await GroupMembershipModel.sync({ alter: true });

  await VaultModel.sync({ alter: true });
  await AppModel.sync({ alter: true });
  await Dataset.sync({ alter: true });
  await Provider.sync({ alter: true });
  await Clone.sync({ alter: true });
  await KeyModel.sync({ alter: true });
  await FileModel.sync({ alter: true });
  await DustAppSecret.sync({ alter: true });
  await GroupVaultModel.sync({ alter: true });
  await DataSourceModel.sync({ alter: true });
  await DataSourceViewModel.sync({ alter: true });
  await RunModel.sync({ alter: true });
  await RunUsageModel.sync({ alter: true });
  await TrackedDocument.sync({ alter: true });
  await DocumentTrackerChangeSuggestion.sync({ alter: true });

  await Plan.sync({ alter: true });
  await Subscription.sync({ alter: true });
  await TemplateModel.sync({ alter: true });

  await AgentConfiguration.sync({ alter: true });
  await AgentUserRelation.sync({ alter: true });
  await GlobalAgentSettings.sync({ alter: true });

  await AgentRetrievalConfiguration.sync({ alter: true });
  await AgentDustAppRunConfiguration.sync({ alter: true });
  await AgentTablesQueryConfiguration.sync({ alter: true });
  await AgentTablesQueryConfigurationTable.sync({ alter: true });
  await AgentProcessConfiguration.sync({ alter: true });
  await AgentWebsearchConfiguration.sync({ alter: true });
  await AgentBrowseConfiguration.sync({ alter: true });
  await AgentVisualizationConfiguration.sync({ alter: true });

  await AgentDataSourceConfiguration.sync({ alter: true });

  await Conversation.sync({ alter: true });
  await ConversationParticipant.sync({ alter: true });
  await UserMessage.sync({ alter: true });
  await AgentMessage.sync({ alter: true });
  await ContentFragmentModel.sync({ alter: true });
  await Message.sync({ alter: true });
  await MessageReaction.sync({ alter: true });
  await Mention.sync({ alter: true });

  await AgentRetrievalAction.sync({ alter: true });
  await AgentTablesQueryAction.sync({ alter: true });
  await AgentDustAppRunAction.sync({ alter: true });
  await AgentProcessAction.sync({ alter: true });
  await AgentWebsearchAction.sync({ alter: true });
  await AgentBrowseAction.sync({ alter: true });
  await AgentVisualizationAction.sync({ alter: true });
  await AgentMessageContent.sync({ alter: true });

  await RetrievalDocument.sync({ alter: true });
  await RetrievalDocumentChunk.sync({ alter: true });

  await FeatureFlag.sync({ alter: true });

  await ConversationClassification.sync({ alter: true });

  // Labs - Can be removed at all times if a solution is dropped
  await LabsTranscriptsConfigurationModel.sync({ alter: true });
  await LabsTranscriptsHistoryModel.sync({ alter: true });

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
