import { BotToggle } from "@app/components/workspace/settings/BotToggle";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useBotDataSources } from "@app/lib/swr/data_sources";
import { useSystemSpace } from "@app/lib/swr/spaces";
import type { WorkspaceType } from "@app/types/user";
import {
  DiscordLogo,
  MicrosoftLogo,
  SlackLogo,
  Spinner,
} from "@dust-tt/sparkle";

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
  const hasAdminGovernanceFeature = hasFeature("admin_governance");

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
        name="Slack Bot"
        description={
          hasAdminGovernanceFeature
            ? "Control whether the Dust Bot can be used in Slack."
            : "Use Dust Agents in Slack with the Dust Slack app"
        }
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
        description={
          hasAdminGovernanceFeature
            ? "Control whether the Dust Bot can be used in Microsoft Teams."
            : "Use Dust Agents in Teams with the Dust Microsoft Teams Bot"
        }
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
          description={
            hasAdminGovernanceFeature
              ? "Control whether the Dust Bot can be used in Discord."
              : "Use Dust Agents in Discord with the Dust Discord app"
          }
          visual={<DiscordLogo className="h-6 w-6" />}
        />
      )}
    </>
  );
}
