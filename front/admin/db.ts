import {
  AgentConfiguration,
  AgentDataSourceConfiguration,
  AgentGenerationConfiguration,
  AgentMessage,
  AgentRetrievalAction,
  AgentRetrievalConfiguration,
  App,
  ChatMessage,
  ChatRetrievedDocument,
  ChatSession,
  Clone,
  Conversation,
  Dataset,
  DataSource,
  DocumentTrackerChangeSuggestion,
  EventSchema,
  ExtractedEvent,
  GensTemplate,
  Key,
  Membership,
  MembershipInvitation,
  Message,
  Provider,
  RetrievalDocument,
  RetrievalDocumentChunk,
  Run,
  TrackedDocument,
  User,
  UserMessage,
  UserMetadata,
  Workspace,
  XP1Run,
  XP1User,
} from "@app/lib/models";

async function main() {
  await User.sync({ alter: true });
  await UserMetadata.sync({ alter: true });
  await Workspace.sync({ alter: true });
  await Membership.sync({ alter: true });
  await MembershipInvitation.sync({ alter: true });
  await App.sync({ alter: true });
  await Dataset.sync({ alter: true });
  await Provider.sync({ alter: true });
  await Clone.sync({ alter: true });
  await Key.sync({ alter: true });
  await DataSource.sync({ alter: true });
  await Run.sync({ alter: true });
  await ChatSession.sync({ alter: true });
  await ChatMessage.sync({ alter: true });
  await ChatRetrievedDocument.sync({ alter: true });
  await TrackedDocument.sync({ alter: true });
  await GensTemplate.sync({ alter: true });
  await EventSchema.sync({ alter: true });
  await ExtractedEvent.sync({ alter: true });
  await DocumentTrackerChangeSuggestion.sync({ alter: true });

  await AgentGenerationConfiguration.sync({ alter: true });
  await AgentRetrievalConfiguration.sync({ alter: true });
  await AgentDataSourceConfiguration.sync({ alter: true });
  await AgentConfiguration.sync({ alter: true });
  await AgentRetrievalAction.sync({ alter: true });
  await RetrievalDocument.sync({ alter: true });
  await RetrievalDocumentChunk.sync({ alter: true });

  await Conversation.sync({ alter: true });
  await UserMessage.sync({ alter: true });
  await AgentMessage.sync({ alter: true });
  await Message.sync({ alter: true });

  await XP1User.sync({ alter: true });
  await XP1Run.sync({ alter: true });

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
