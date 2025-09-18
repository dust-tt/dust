import { BookOpenIcon, Breadcrumbs, Page, Spinner } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useState } from "react";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { DeleteProviderDialog } from "@app/components/labs/transcripts/DeleteProviderDialog";
import { ProcessingConfiguration } from "@app/components/labs/transcripts/ProcessingConfiguration";
import { ProviderSelection } from "@app/components/labs/transcripts/ProviderSelection";
import { StorageConfiguration } from "@app/components/labs/transcripts/StorageConfiguration";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useSendNotification } from "@app/hooks/useNotification";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useLabsTranscriptsConfiguration } from "@app/lib/swr/labs";
import { useSpaces } from "@app/lib/swr/spaces";
import type {
  DataSourceViewType,
  SubscriptionType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import { isProviderWithDefaultWorkspaceConfiguration } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSourcesViews: DataSourceViewType[];
  featureFlags: WhitelistableFeature[];
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

  const dataSourcesViews = (
    await DataSourceViewResource.listByWorkspace(auth)
  ).map((dsv) => dsv.toJSON());

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

  const handleDisconnectProvider = async (
    transcriptConfigurationId: string | null
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

  const agents = agentConfigurations.filter((a) => a.status === "active");
  const items = [
    {
      label: "Exploratory features",
      href: `/w/${owner.sId}/labs`,
    },
    {
      label: "Meeting transcripts processing",
      href: `/w/${owner.sId}/labs/transcripts`,
    },
  ];

  return (
    <ConversationsNavigationProvider>
      <AppCenteredLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Transcripts processing"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Breadcrumbs items={items} />
        <DeleteProviderDialog
          isOpen={isDeleteProviderDialogOpened}
          onClose={() => setIsDeleteProviderDialogOpened(false)}
          onConfirm={async () => {
            await handleDisconnectProvider(
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              transcriptsConfiguration?.sId || null
            );
          }}
        />
        <Page>
          <Page.Header
            title="Meeting transcripts processing"
            icon={BookOpenIcon}
            description="Receive meeting minutes processed by email automatically and store them in a Dust Folder."
          />
          <Page.Layout direction="vertical">
            <ProviderSelection
              transcriptsConfiguration={transcriptsConfiguration}
              mutateTranscriptsConfiguration={mutateTranscriptsConfiguration}
              setIsDeleteProviderDialogOpened={setIsDeleteProviderDialogOpened}
              owner={owner}
            />

            {transcriptsConfiguration && (
              <>
                {(!isProviderWithDefaultWorkspaceConfiguration(
                  transcriptsConfiguration.provider
                ) ||
                  transcriptsConfiguration.isDefaultWorkspaceConfiguration) && (
                  <StorageConfiguration
                    owner={owner}
                    transcriptsConfiguration={transcriptsConfiguration}
                    mutateTranscriptsConfiguration={
                      mutateTranscriptsConfiguration
                    }
                    dataSourcesViews={dataSourcesViews}
                    spaces={spaces}
                    isSpacesLoading={isSpacesLoading}
                  />
                )}
                <ProcessingConfiguration
                  owner={owner}
                  agents={agents}
                  transcriptsConfiguration={transcriptsConfiguration}
                  mutateTranscriptsConfiguration={
                    mutateTranscriptsConfiguration
                  }
                />
              </>
            )}
          </Page.Layout>
        </Page>
      </AppCenteredLayout>
    </ConversationsNavigationProvider>
  );
}

LabsTranscriptsIndex.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
