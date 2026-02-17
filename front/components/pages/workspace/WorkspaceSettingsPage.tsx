import { CapabilitiesSection } from "@app/components/workspace/settings/CapabilitiesSection";
import { IntegrationsSection } from "@app/components/workspace/settings/IntegrationsSection";
import { ModelSelectionSection } from "@app/components/workspace/settings/ModelSelectionSection";
import { WorkspaceNameEditor } from "@app/components/workspace/settings/WorkspaceNameEditor";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useBotDataSources } from "@app/lib/swr/data_sources";
import { useSystemSpace } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { GlobeAltIcon, Page, Spinner } from "@dust-tt/sparkle";

export function WorkspaceSettingsPage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const { featureFlags, isFeatureFlagsLoading } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const { systemSpace, isSystemSpaceLoading } = useSystemSpace({
    workspaceId: owner.sId,
  });
  const {
    slackBotDataSource,
    microsoftBotDataSource,
    discordBotDataSource,
    isBotDataSourcesLoading,
  } = useBotDataSources({ workspaceId: owner.sId });

  const isDiscordBotAvailable = featureFlags.includes("discord_bot");

  const isLoading =
    isFeatureFlagsLoading || isSystemSpaceLoading || isBotDataSourcesLoading;

  if (isLoading || !systemSpace) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header title="Workspace Settings" icon={GlobeAltIcon} />
      <Page.Vertical align="stretch" gap="md">
        <WorkspaceNameEditor owner={owner} />
      </Page.Vertical>
      <ModelSelectionSection owner={owner} plan={subscription.plan} />
      <CapabilitiesSection
        owner={owner}
        showRestrictAgentsPublishing={featureFlags.includes(
          "restrict_agents_publishing"
        )}
      />
      <IntegrationsSection
        owner={owner}
        systemSpace={systemSpace}
        slackBotDataSource={slackBotDataSource}
        microsoftBotDataSource={microsoftBotDataSource}
        discordBotDataSource={discordBotDataSource}
        isDiscordBotAvailable={isDiscordBotAvailable}
      />
    </Page.Vertical>
  );
}
