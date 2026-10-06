import { BotToggle } from "@app/components/workspace/settings/BotToggle";
import { MESSAGING_APP_METADATA } from "@app/components/workspace/settings/settings_metadata";
import { useBotDataSources } from "@app/lib/swr/data_sources";
import { useSystemSpace } from "@app/lib/swr/spaces";
import type { WorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface MessagingAppTogglesProps {
  owner: WorkspaceType;
}

export function MessagingAppToggles({ owner }: MessagingAppTogglesProps) {
  const { t } = useLingui();
  const { systemSpace, isSystemSpaceLoading } = useSystemSpace({
    workspaceId: owner.sId,
  });
  const {
    slackBotDataSource,
    microsoftBotDataSource,
    isBotDataSourcesLoading,
  } = useBotDataSources({ workspaceId: owner.sId });

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
        name={t`Slack Bot`}
        description={t`Whether the Dust Bot can be used in Slack`}
        documentationUrl={MESSAGING_APP_METADATA.slack_bot.documentationUrl}
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
        name={t`Microsoft Teams Bot`}
        description={t`Whether the Dust Bot can be used in Microsoft Teams`}
        documentationUrl={MESSAGING_APP_METADATA.microsoft_bot.documentationUrl}
      />
    </>
  );
}
