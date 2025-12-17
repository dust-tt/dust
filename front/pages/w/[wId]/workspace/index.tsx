import { GlobeAltIcon, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { CapabilitiesSection } from "@app/components/workspace/settings/CapabilitiesSection";
import { IntegrationsSection } from "@app/components/workspace/settings/IntegrationsSection";
import { ModelSelectionSection } from "@app/components/workspace/settings/ModelSelectionSection";
import { WorkspaceNameEditor } from "@app/components/workspace/settings/WorkspaceNameEditor";
import type { RegionType } from "@app/lib/api/regions/config";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  DataSourceType,
  SpaceType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  isDiscordBotAvailable: boolean;
  slackBotDataSource: DataSourceType | null;
  microsoftBotDataSource: DataSourceType | null;
  discordBotDataSource: DataSourceType | null;
  systemSpace: SpaceType;
  region: RegionType;
}>(async (_, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !auth.isAdmin() || !subscription) {
    return {
      notFound: true,
    };
  }

  const [
    [slackBotDataSource],
    [microsoftBotDataSource],
    [discordBotDataSource],
  ] = await Promise.all([
    DataSourceResource.listByConnectorProvider(auth, "slack_bot"),
    DataSourceResource.listByConnectorProvider(auth, "microsoft_bot"),
    DataSourceResource.listByConnectorProvider(auth, "discord_bot"),
  ]);

  const featureFlags = await getFeatureFlags(owner);
  const isDiscordBotAvailable = featureFlags.includes("discord_bot");

  const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

  return {
    props: {
      owner,
      subscription,
      isDiscordBotAvailable,
      slackBotDataSource: slackBotDataSource?.toJSON() ?? null,
      microsoftBotDataSource: microsoftBotDataSource?.toJSON() ?? null,
      discordBotDataSource: discordBotDataSource?.toJSON() ?? null,
      systemSpace: systemSpace.toJSON(),
      region: regionConfig.getCurrentRegion(),
    },
  };
});

export default function WorkspaceAdmin({
  owner,
  subscription,
  isDiscordBotAvailable,
  slackBotDataSource,
  microsoftBotDataSource,
  discordBotDataSource,
  systemSpace,
  region,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });

  return (
    <AppCenteredLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({
        owner,
        current: "workspace",
        featureFlags,
      })}
    >
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header title="Workspace Settings" icon={GlobeAltIcon} />
        <Page.Vertical align="stretch" gap="md">
          <WorkspaceNameEditor owner={owner} />
        </Page.Vertical>
        <ModelSelectionSection
          owner={owner}
          plan={subscription.plan}
          region={region}
        />
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
    </AppCenteredLayout>
  );
}

WorkspaceAdmin.getLayout = (page: ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
