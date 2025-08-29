import { TeamsAdapter } from "@microsoft/teams-ai";
// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
import { ConfigurationServiceClientCredentialFactory, TurnContext } from "botbuilder";
import config from "./config";

// Create adapter.
// See https://aka.ms/about-bot-adapter to learn more about how bots work.
export const adapter = new TeamsAdapter(
  {},
  new ConfigurationServiceClientCredentialFactory(config)
);

// Catch-all for errors.
const onTurnErrorHandler = async (context: TurnContext, error: any) => {
  // This check writes out errors to console log .vs. app insights.
  // NOTE: In production environment, you should consider logging this to Azure
  //       application insights.
  console.error(`\n [onTurnError] unhandled error: ${error}`);
  console.log(error);

  // Send a trace activity, which will be displayed in Bot Framework Emulator
  await context.sendTraceActivity(
    "OnTurnError Trace",
    `${error}`,
    "https://www.botframework.com/schemas/error",
    "TurnError"
  );

  // Send a message to the user
  await context.sendActivity("The bot encountered an error or bug.");
  await context.sendActivity("To continue to run this bot, please fix the bot source code.");
};

// Set the onTurnError for the singleton CloudAdapter.
adapter.onTurnError = onTurnErrorHandler;
