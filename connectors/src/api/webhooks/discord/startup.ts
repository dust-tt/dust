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

interface DiscordCommand {
  id?: string;
  name: string;
  description: string;
  type: number;
}

async function getExistingCommands(): Promise<DiscordCommand[]> {
  const botToken = apiConfig.getDiscordBotToken();
  const applicationId = apiConfig.getDiscordApplicationId();

  if (!botToken || !applicationId) {
    throw new Error(
      "Discord API credentials not configured. Set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID environment variables."
    );
  }

  const url = `${DISCORD_API_BASE_URL}/applications/${applicationId}/commands`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch Discord commands: ${response.status} ${errorText}`
    );
  }

  return (await response.json()) as DiscordCommand[];
}

function getDesiredCommands(): DiscordSlashCommand[] {
  return [
    {
      name: "list-dust-agents",
      description: "List available agents for this workspace",
      type: 1,
    },
  ];
}

function commandsMatch(
  existing: DiscordCommand[],
  desired: DiscordSlashCommand[]
): boolean {
  if (existing.length !== desired.length) {
    return false;
  }

  const sortedExisting = [...existing].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const sortedDesired = [...desired].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  for (let i = 0; i < sortedExisting.length; i++) {
    const existingCmd = sortedExisting[i];
    const desiredCmd = sortedDesired[i];

    if (!existingCmd || !desiredCmd) {
      return false;
    }

    if (
      existingCmd.name !== desiredCmd.name ||
      existingCmd.description !== desiredCmd.description ||
      existingCmd.type !== (desiredCmd.type || 1)
    ) {
      return false;
    }
  }

  return true;
}

async function bulkOverwriteCommands(
  commands: DiscordSlashCommand[]
): Promise<void> {
  const botToken = apiConfig.getDiscordBotToken();
  const applicationId = apiConfig.getDiscordApplicationId();

  if (!botToken || !applicationId) {
    throw new Error(
      "Discord API credentials not configured. Set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID environment variables."
    );
  }

  const url = `${DISCORD_API_BASE_URL}/applications/${applicationId}/commands`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      commands.map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        type: cmd.type || 1, // 1 is default type for slash commands
      }))
    ),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to bulk overwrite Discord commands: ${response.status} ${errorText}`
    );
  }

  logger.info("Successfully bulk overwrote Discord commands");
}

// This function is intended to be non-blocking and run during startup.
export function initializeDiscordCommands(): void {
  void (async () => {
    try {
      const existingCommands = await getExistingCommands();
      const desiredCommands = getDesiredCommands();

      if (commandsMatch(existingCommands, desiredCommands)) {
        logger.info("Discord commands already up to date");
        return;
      }

      logger.info("Updating Discord commands");
      await bulkOverwriteCommands(desiredCommands);
      logger.info("Discord commands registered successfully");
    } catch (error) {
      logger.error(
        { error: normalizeError(error) },
        "Failed to initialize Discord commands"
      );
    }
  })();
}
