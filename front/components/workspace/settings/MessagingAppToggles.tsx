import { BotToggle } from "@app/components/workspace/settings/BotToggle";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useBotDataSources } from "@app/lib/swr/data_sources";
import { useSystemSpace } from "@app/lib/swr/spaces";
import type { WorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";

// Name and description of each messaging app bot, shared with the read-only Poke governance view.
export const MESSAGING_APP_METADATA = {
  slack_bot: {
    name: "Slack Bot",
    description: "Whether the Dust Bot can be used in Slack",
    documentationUrl: "https://docs.dust.tt/docs/slack",
  },
  microsoft_bot: {
    name: "Microsoft Teams Bot",
    description: "Whether the Dust Bot can be used in Microsoft Teams",
    documentationUrl: "https://docs.dust.tt/docs/dust-in-teams",
  },
  discord_bot: {
    name: "Discord Bot",
    description: "Whether the Dust Bot can be used in Discord",
    documentationUrl: undefined,
  },
} as const;

interface MessagingAppTogglesProps {
  owner: WorkspaceType;
}

export function MessagingAppToggles({ owner }: MessagingAppTogglesProps) {
  const { hasFeature } = useFeatureFlags();
  const { systemSpace, isSystemSpaceLoading } = useSystemSpace({
    workspaceId: owner.sId,
  });
  const {
    slackBotDataSource,
    microsoftBotDataSource,
    discordBotDataSource,
    isBotDataSourcesLoading,
  } = useBotDataSources({ workspaceId: owner.sId });

  const isDiscordBotAvailable = hasFeature("discord_bot");

  if (isSystemSpaceLoading || isBotDataSourcesLoading || !systemSpace) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <>
      <BotToggle
        owner={owner}
        botDataSource={slackBotDataSource}
        systemSpace={systemSpace}
        oauth={{ provider: "slack", useCase: "bot", extraConfig: {} }}
        connectorProvider="slack_bot"
        {...MESSAGING_APP_METADATA.slack_bot}
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
        {...MESSAGING_APP_METADATA.microsoft_bot}
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
          {...MESSAGING_APP_METADATA.discord_bot}
        />
      )}
    </>
  );
}
