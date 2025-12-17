import {
  ContextItem,
  DiscordLogo,
  MicrosoftLogo,
  Page,
  SlackLogo,
} from "@dust-tt/sparkle";

import { BotToggle } from "@app/components/workspace/settings/BotToggle";
import type { DataSourceType, SpaceType, WorkspaceType } from "@app/types";

export function IntegrationsSection({
  owner,
  systemSpace,
  slackBotDataSource,
  microsoftBotDataSource,
  discordBotDataSource,
  isDiscordBotAvailable,
}: {
  owner: WorkspaceType;
  systemSpace: SpaceType;
  slackBotDataSource: DataSourceType | null;
  microsoftBotDataSource: DataSourceType | null;
  discordBotDataSource: DataSourceType | null;
  isDiscordBotAvailable: boolean;
}) {
  return (
    <Page.Vertical align="stretch" gap="md">
      <Page.H variant="h4">Integrations</Page.H>
      <ContextItem.List>
        <div className="h-full border-b border-border dark:border-border-night" />
        <BotToggle
          owner={owner}
          botDataSource={slackBotDataSource}
          systemSpace={systemSpace}
          oauth={{ provider: "slack", useCase: "bot", extraConfig: {} }}
          connectorProvider="slack_bot"
          name="Slack Bot"
          description="Use Dust Agents in Slack with the Dust Slack app"
          visual={<SlackLogo className="h-6 w-6" />}
          documentationUrl="https://docs.dust.tt/docs/slack"
        />
        <BotToggle
          owner={owner}
          botDataSource={microsoftBotDataSource}
          systemSpace={systemSpace}
          oauth={{
            provider: "microsoft_tools",
            useCase: "bot",
            extraConfig: {},
          }}
          connectorProvider="microsoft_bot"
          name="Microsoft Teams Bot"
          description="Use Dust Agents in Teams with the Dust Microsoft Teams Bot"
          visual={<MicrosoftLogo className="h-6 w-6" />}
          documentationUrl="https://docs.dust.tt/docs/dust-in-teams"
        />
        {isDiscordBotAvailable && (
          <BotToggle
            owner={owner}
            botDataSource={discordBotDataSource}
            systemSpace={systemSpace}
            oauth={{
              provider: "discord",
              useCase: "bot",
              extraConfig: {},
            }}
            connectorProvider="discord_bot"
            name="Discord Bot"
            description="Use Dust Agents in Discord with the Dust Discord app"
            visual={<DiscordLogo className="h-6 w-6" />}
          />
        )}
      </ContextItem.List>
    </Page.Vertical>
  );
}
