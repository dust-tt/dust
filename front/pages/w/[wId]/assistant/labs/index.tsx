import {
  BookOpenIcon,
  Button,
  Cog6ToothIcon,
  ContextItem,
  HubspotLogo,
  Icon,
  Page,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type {
  DataSourceViewType,
  SubscriptionType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSourcesViews: DataSourceViewType[];
  hasDefaultStorageConfiguration: boolean;
  featureFlags: WhitelistableFeature[];
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

  const dataSourcesViews = (
    await DataSourceViewResource.listByWorkspace(auth)
  ).map((dsv) => dsv.toJSON());

  const defaultStorageConfiguration =
    await LabsTranscriptsConfigurationResource.fetchDefaultConfigurationForWorkspace(
      auth.getNonNullableWorkspace()
    );
  const hasDefaultStorageConfiguration = !!defaultStorageConfiguration?.id;

  if (!owner || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("labs_transcripts")) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      dataSourcesViews,
      hasDefaultStorageConfiguration,
      featureFlags,
    },
  };
});

export default function LabsTranscriptsIndex({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <ConversationsNavigationProvider>
      <AppLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Transcripts processing"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Page>
          <Page.Header
            title="Beta features"
            icon={TestTubeIcon}
            description="Expect some bumps and changes. Feedback welcome, tell us what you think!"
          />
          <Page.Layout direction="vertical">
            <ContextItem.List>
              <ContextItem.SectionHeader
                title="Features"
                description="All features presented here are in beta and may change or be removed."
              />
              <ContextItem
                title="Meeting Transcripts Processing"
                action={
                  <Button
                    variant="outline"
                    label="Manage"
                    size="sm"
                    icon={Cog6ToothIcon}
                    onClick={() =>
                      router.push(`/w/${owner.sId}/assistant/labs/transcripts`)
                    }
                  />
                }
                visual={<Icon visual={BookOpenIcon} />}
              >
                <ContextItem.Description
                  description="Receive meeting minutes processed by email automatically and
                  store them in a Dust Folder."
                />
              </ContextItem>

              <ContextItem.SectionHeader
                title="Connections"
                description="These connections are being tested and may require some manual steps."
              />
              {/* hubspot connection */}
              <ContextItem
                title="Hubspot"
                action={<Button variant="outline" label="Connect" size="sm" />}
                visual={<Icon visual={HubspotLogo} />}
              >
                <ContextItem.Description description="Import your Hubspot account summaries into Dust." />
              </ContextItem>
            </ContextItem.List>
          </Page.Layout>
        </Page>
      </AppLayout>
    </ConversationsNavigationProvider>
  );
}
