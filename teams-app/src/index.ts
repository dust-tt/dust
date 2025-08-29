import { TurnContext } from "botbuilder";
import express from "express";
import { GenericCommandHandler } from "./genericCommandHandler";
import { adapter } from "./internal/initialize";
import { ApplicationTurnState } from "./internal/interface";
import { app } from "./teamsBot";

// This template uses `express` to serve HTTP responses.
// Create express application.
const expressApp = express();
expressApp.use(express.json());

const server = expressApp.listen(
  process.env.port || process.env.PORT || 3978,
  () => {
    console.log(
      `\nBot Started, ${expressApp.name} listening to`,
      server.address()
    );
  }
);

const genericCommandHandler = new GenericCommandHandler();
app.message(
  genericCommandHandler.triggerPatterns,
  async (context: TurnContext, state: ApplicationTurnState) => {
    const reply = await genericCommandHandler.handleCommandReceived(
      context,
      state
    );

    if (reply) {
      await context.sendActivity(reply);
    }
  }
);

// Register an API endpoint with `express`. Teams sends messages to your application
// through this endpoint.
//
// The Microsoft 365 Agents Toolkit bot registration configures the bot with `/api/messages` as the
// Bot Framework endpoint. If you customize this route, update the Bot registration
// in `infra/botRegistration/azurebot.bicep`.
expressApp.post("/api/messages", async (req, res) => {
  await adapter.process(req, res, async (context) => {
    await app.run(context);
  });
});
