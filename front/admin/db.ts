import { sendInitDbMessage } from "@dust-tt/types";

import { App, Clone, Dataset, Provider, Run } from "@app/lib/models/apps";
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
  AgentWebsearchAction,
  AgentWebsearchConfiguration,
} from "@app/lib/models/assistant/actions/websearch";
import {
  AgentConfiguration,
  AgentUserRelation,
  GlobalAgentSettings,
} from "@app/lib/models/assistant/agent";
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
import { DataSource } from "@app/lib/models/data_source";
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
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
// Labs - Can be removed at all times if a solution is dropped
import {
  LabsTranscriptsConfigurationModel,
  LabsTranscriptsHistoryModel,
} from "@app/lib/resources/storage/models/labs_transcripts";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { TemplateModel } from "@app/lib/resources/storage/models/templates";
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
  await App.sync({ alter: true });
  await Dataset.sync({ alter: true });
  await Provider.sync({ alter: true });
  await Clone.sync({ alter: true });
  await KeyModel.sync({ alter: true });
  await DustAppSecret.sync({ alter: true });
  await DataSource.sync({ alter: true });
  await Run.sync({ alter: true });
  await TrackedDocument.sync({ alter: true });
  await DocumentTrackerChangeSuggestion.sync({ alter: true });

  await Plan.sync({ alter: true });
  await Subscription.sync({ alter: true });

  await AgentConfiguration.sync({ alter: true });
  await AgentUserRelation.sync({ alter: true });
  await GlobalAgentSettings.sync({ alter: true });

  await AgentRetrievalConfiguration.sync({ alter: true });
  await AgentDustAppRunConfiguration.sync({ alter: true });
  await AgentTablesQueryConfiguration.sync({ alter: true });
  await AgentTablesQueryConfigurationTable.sync({ alter: true });
  await AgentProcessConfiguration.sync({ alter: true });
  await AgentWebsearchConfiguration.sync({ alter: true });

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

  await RetrievalDocument.sync({ alter: true });
  await RetrievalDocumentChunk.sync({ alter: true });

  await FeatureFlag.sync({ alter: true });

  await ConversationClassification.sync({ alter: true });

  await TemplateModel.sync({ alter: true });

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
