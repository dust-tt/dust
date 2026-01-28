import { GlobeAltIcon, Page, Spinner } from "@dust-tt/sparkle";
import type { ReactElement } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { CapabilitiesSection } from "@app/components/workspace/settings/CapabilitiesSection";
import { IntegrationsSection } from "@app/components/workspace/settings/IntegrationsSection";
import { ModelSelectionSection } from "@app/components/workspace/settings/ModelSelectionSection";
import { WorkspaceNameEditor } from "@app/components/workspace/settings/WorkspaceNameEditor";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsForAdmin } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useBotDataSources } from "@app/lib/swr/data_sources";
import { useSystemSpace } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

export const getServerSideProps = appGetServerSidePropsForAdmin;

function WorkspaceAdmin() {
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
      <AppCenteredLayout
        subscription={subscription}
        owner={owner}
        subNavigation={subNavigationAdmin({
          owner,
          current: "workspace",
          featureFlags,
        })}
      >
        <div className="flex h-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      </AppCenteredLayout>
    );
  }

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
    </AppCenteredLayout>
  );
}

const PageWithAuthLayout = WorkspaceAdmin as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
