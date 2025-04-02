import {
  BookOpenIcon,
  Button,
  Cog6ToothIcon,
  ContextItem,
  Icon,
  NotionLogo,
  Page,
  Spinner,
  TestTubeIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useLabsTranscriptsConfiguration } from "@app/lib/swr/labs";
import { useSpaces } from "@app/lib/swr/spaces";
import type {
  DataSourceViewType,
  ModelId,
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
  dataSourcesViews,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const {
    transcriptsConfiguration,
    isTranscriptsConfigurationLoading,
    mutateTranscriptsConfiguration,
  } = useLabsTranscriptsConfiguration({ workspaceId: owner.sId });
  const [isDeleteProviderDialogOpened, setIsDeleteProviderDialogOpened] =
    useState(false);

  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
  });
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    sort: "priority",
  });

  const sendNotification = useSendNotification();

  const router = useRouter();

  const handleDisconnectProvider = async (
    transcriptConfigurationId: ModelId | null
  ) => {
    if (!transcriptConfigurationId) {
      return;
    }

    const response = await fetch(
      `/api/w/${owner.sId}/labs/transcripts/${transcriptConfigurationId}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      sendNotification({
        type: "error",
        title: "Failed to disconnect provider",
        description:
          "Could not disconnect from your transcripts provider. Please try again.",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Provider disconnected",
        description:
          "Your transcripts provider has been disconnected successfully.",
      });

      await mutateTranscriptsConfiguration();
    }

    return response;
  };

  if (isTranscriptsConfigurationLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Spinner />
      </div>
    );
  }

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
            title="Dust Labs"
            icon={TestTubeIcon}
            description="Expect some bumps and changes. Feedback welcome!"
          />
          <Page.Layout direction="vertical">
            <ContextItem.List>
              <ContextItem.SectionHeader
                title="Exploratory features"
                description="Features that are still in beta and may change or be removed."
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
                title="Experimental connections"
                description="Connections that are being tested and may require some manual steps."
              />
              {/* hubspot connection */}
              <ContextItem
                title="Hubspot"
                action={<Button variant="outline" label="Connect" size="sm" />}
                visual={<Icon visual={NotionLogo} />}
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
