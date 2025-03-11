import {
  BookOpenIcon,
  Page,
  Spinner,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LabsTranscriptsProviderType,
  LightAgentConfigurationType,
  SubscriptionType,
  WhitelistableFeature,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useEffect, useState } from "react";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { DeleteProviderDialog } from "@app/components/labs/transcripts/DeleteProviderDialog";
import { ProcessingConfiguration } from "@app/components/labs/transcripts/ProcessingConfiguration";
import { ProviderSelection } from "@app/components/labs/transcripts/ProviderSelection";
import { StorageConfiguration } from "@app/components/labs/transcripts/StorageConfiguration";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import {
  useLabsTranscriptsConfiguration,
  useLabsTranscriptsIsConnectorConnected,
} from "@app/lib/swr/labs";
import { useSpaces } from "@app/lib/swr/spaces";

export type TranscriptsConfigurationState = {
  provider: LabsTranscriptsProviderType | null;
  isGDriveConnected: boolean;
  isGongConnected: boolean;
  isModjoConnected: boolean;
  assistantSelected: LightAgentConfigurationType | null;
  isActive: boolean;
  dataSourceView: DataSourceViewType | null;
  credentialId: string | null;
  hasDefaultConfiguration: boolean;
};

const defaultTranscriptConfigurationState: TranscriptsConfigurationState = {
  provider: null,
  isGDriveConnected: false,
  isGongConnected: false,
  isModjoConnected: false,
  assistantSelected: null,
  isActive: false,
  dataSourceView: null,
  credentialId: null,
  hasDefaultConfiguration: false,
};

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
    await LabsTranscriptsConfigurationResource.fetchDefaultFullStorageConfigurationForWorkspace(
      auth
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

  const handleDisconnectProvider = async (
    transcriptConfigurationId: number | null
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

  const [transcriptsConfigurationState, setTranscriptsConfigurationState] =
    useState<TranscriptsConfigurationState>(
      defaultTranscriptConfigurationState
    );

  if (isTranscriptsConfigurationLoading) {
    return <Spinner />;
  }

  const agents = agentConfigurations.filter((a) => a.status === "active");

  return (
    <ConversationsNavigationProvider>
      <AppLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Transcripts processing"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <DeleteProviderDialog
          isOpen={isDeleteProviderDialogOpened}
          onClose={() => setIsDeleteProviderDialogOpened(false)}
          onConfirm={async () => {
            await handleDisconnectProvider(
              transcriptsConfiguration?.id || null
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
                <ProcessingConfiguration
                  owner={owner}
                  agents={agents}
                  transcriptsConfiguration={transcriptsConfiguration}
                  transcriptsConfigurationState={transcriptsConfigurationState}
                  setTranscriptsConfigurationState={
                    setTranscriptsConfigurationState
                  }
                  mutateTranscriptsConfiguration={
                    mutateTranscriptsConfiguration
                  }
                />
              </>
            )}
          </Page.Layout>
        </Page>
      </AppLayout>
    </ConversationsNavigationProvider>
  );
}
