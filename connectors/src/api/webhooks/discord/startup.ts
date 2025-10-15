import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import { DISCORD_API_BASE_URL } from "@connectors/api/webhooks/discord/utils";
import { apiConfig } from "@connectors/lib/api/config";
import mainLogger from "@connectors/logger/logger";
import { normalizeError } from "@connectors/types";

const logger = mainLogger.child(
  {
    provider: "discord",
  },
  {
    msgPrefix: "[Discord Initialization] ",
  }
);

interface DiscordSlashCommand {
  name: string;
  description: string;
  type?: number;
}

async function registerSlashCommand(
  command: DiscordSlashCommand
): Promise<Result<void, Error>> {
  const botToken = apiConfig.getDiscordBotToken();
  const applicationId = apiConfig.getDiscordApplicationId();

  if (!botToken || !applicationId) {
    throw new Error(
      "Discord API credentials not configured. Set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID environment variables."
    );
  }

  const url = `${DISCORD_API_BASE_URL}/applications/${applicationId}/commands`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: command.name,
        description: command.description,
        type: command.type || 1, // 1 is default for slash command
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          command: command.name,
        },
        "Failed to register Discord slash command"
      );
      return new Err(
        new Error(
          `Failed to register Discord slash command: ${response.status} ${errorText}`
        )
      );
    }

    logger.info(
      { command: command.name },
      "Successfully registered Discord slash command"
    );

    return new Ok(undefined);
  } catch (error) {
    logger.error(
      { error, command: command.name },
      "Error registering Discord slash command"
    );
    return new Err(normalizeError(error));
  }
}

/**
 * Register the agents command as a Discord slash command.
 */
async function registerAgentsCommand(): Promise<Result<void, Error>> {
  const agentsCommand: DiscordSlashCommand = {
    name: "list-dust-agents",
    description: "List available agents for this workspace",
  };

  return registerSlashCommand(agentsCommand);
}

/**
 * Initialize Discord commands during service startup. This registers the slash commands with
 * Discord.
 */
export async function initializeDiscordCommands(): Promise<void> {
  logger.info("Registering agents command with Discord");

  const result = await registerAgentsCommand();

  if (result.isOk()) {
    logger.info("Discord agents command successfully registered");
  } else {
    logger.error(
      { error: result.error },
      "Failed to register Discord agents command"
    );
  }
}
