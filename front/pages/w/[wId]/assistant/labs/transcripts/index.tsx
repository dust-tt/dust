import {
  BookOpenIcon,
  Page,
  Spinner,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LabsTranscriptsProviderType,
  LightAgentConfigurationType,
  SubscriptionType,
  WhitelistableFeature,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { Dispatch, SetStateAction } from "react";
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
  useLabsProviderConnections,
  useLabsTranscriptsConfiguration,
  useLabsTranscriptsDefaultConfiguration,
  useLabsTranscriptsIsConnectorConnected,
} from "@app/lib/swr/labs";
import { useSpaces } from "@app/lib/swr/spaces";

const defaultTranscriptConfigurationState = {
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
  const sendNotification = useSendNotification();
  const {
    transcriptsConfiguration,
    isTranscriptsConfigurationLoading,
    mutateTranscriptsConfiguration,
  } = useLabsTranscriptsConfiguration({ workspaceId: owner.sId });
  const [isDeleteProviderDialogOpened, setIsDeleteProviderDialogOpened] =
    useState(false);
  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>({});
  const [storeInFolder, setStoreInFolder] = useState(false);
  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
  });
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    sort: "priority",
  });

  const { defaultConfiguration: defaultModjoConfiguration } =
    useLabsTranscriptsDefaultConfiguration({
      owner,
      provider: "modjo",
    });

  // Gong checks for the actual connector connection.
  const { isConnectorConnected: isGongConnectorConnected } =
    useLabsTranscriptsIsConnectorConnected({
      owner,
      provider: "gong",
    });

  const {
    handleConnectGoogleTranscriptsSource,
    handleConnectModjoTranscriptsSource,
    handleDisconnectProvider,
  } = useLabsProviderConnections({
    owner,
    mutateTranscriptsConfiguration,
  });

  const handleSetStoreInFolder: Dispatch<SetStateAction<boolean>> = async (
    newValue
  ) => {
    if (!transcriptsConfiguration) {
      return;
    }

    setStoreInFolder(newValue);

    if (!newValue) {
      // When disabling storage, clear the data source view
      await handleSetDataSource(transcriptsConfiguration.id, null);
      setSelectionConfigurations({});
    } else if (transcriptsConfiguration.dataSourceViewId) {
      // When enabling storage, restore the previous data source view if it exists
      const dataSourceView = dataSourcesViews.find(
        (ds) => ds.id === transcriptsConfiguration.dataSourceViewId
      );
      if (dataSourceView) {
        setSelectionConfigurations({
          [dataSourceView.sId]: {
            dataSourceView,
            selectedResources: [],
            isSelectAll: true,
            tagsFilter: null,
          },
        });
      }
    }
  };

  const handleSetSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  > = async (newValue) => {
    if (!transcriptsConfiguration) {
      return;
    }

    const newSelectionConfigurations =
      typeof newValue === "function"
        ? newValue(selectionConfigurations)
        : newValue;

    const keys = Object.keys(newSelectionConfigurations);

    if (keys.length === 0) {
      return;
    }

    const lastKey = keys[keys.length - 1];

    // If there's no change in the selection, return early
    if (
      lastKey &&
      JSON.stringify(selectionConfigurations[lastKey]) ===
        JSON.stringify(newSelectionConfigurations[lastKey])
    ) {
      return;
    }

    setSelectionConfigurations(
      lastKey ? { [lastKey]: newSelectionConfigurations[lastKey] } : {}
    );

    if (lastKey) {
      const datasourceView = newSelectionConfigurations[lastKey].dataSourceView;
      await handleSetDataSource(transcriptsConfiguration.id, datasourceView);
    }
  };

  const [transcriptsConfigurationState, setTranscriptsConfigurationState] =
    useState<{
      provider: LabsTranscriptsProviderType | null;
      isGDriveConnected: boolean;
      isModjoConnected: boolean;
      assistantSelected: LightAgentConfigurationType | null;
      isActive: boolean;
      dataSourceView: DataSourceViewType | null;
      credentialId: string | null;
      hasDefaultConfiguration: boolean;
    }>(defaultTranscriptConfigurationState);

  useEffect(() => {
    if (transcriptsConfiguration) {
      if (transcriptsConfiguration.dataSourceViewId) {
        const dataSourceView = dataSourcesViews.find(
          (ds) => ds.id === transcriptsConfiguration.dataSourceViewId
        );
        if (dataSourceView) {
          setSelectionConfigurations({
            [dataSourceView.sId]: {
              dataSourceView,
              selectedResources: [],
              isSelectAll: true,
              tagsFilter: null, // No tags filters for transcripts.
            },
          });
        }
      }
      setStoreInFolder(!!transcriptsConfiguration.dataSourceViewId);
      setTranscriptsConfigurationState((prev) => {
        return {
          ...prev,
          provider: transcriptsConfiguration.provider || "",
          isGongConnected:
            transcriptsConfiguration.provider === "gong" || false,
          isModjoConnected:
            transcriptsConfiguration.provider === "modjo" || false,
          isGDriveConnected:
            transcriptsConfiguration.provider === "google_drive" || false,
          assistantSelected:
            agentConfigurations.find(
              (a) => a.sId === transcriptsConfiguration.agentConfigurationId
            ) || null,
          isActive: transcriptsConfiguration.isActive || false,
          dataSourceView:
            dataSourcesViews.find(
              (ds) => ds.id === transcriptsConfiguration.dataSourceViewId
            ) || null,
        };
      });
    } else {
      setTranscriptsConfigurationState(() => {
        return defaultTranscriptConfigurationState;
      });
    }
  }, [transcriptsConfiguration, agentConfigurations, dataSourcesViews]);

  if (isTranscriptsConfigurationLoading) {
    return <Spinner />;
  }

  const agents = agentConfigurations.filter((a) => a.status === "active");

  const handleProviderChange = async (
    provider: LabsTranscriptsProviderType
  ) => {
    let hasDefaultConfiguration = false;
    if (provider === "modjo" && defaultModjoConfiguration) {
      hasDefaultConfiguration = true;
    }

    setTranscriptsConfigurationState((prev) => {
      return {
        ...prev,
        provider,
        hasDefaultConfiguration,
      };
    });
    await mutateTranscriptsConfiguration();
  };

  const handleSetDataSource = async (
    transcriptConfigurationId: number,
    dataSourceView: DataSourceViewType | null
  ) => {
    setTranscriptsConfigurationState((prev) => {
      return {
        ...prev,
        dataSourceView,
      };
    });

    let successMessage = "The transcripts will not be stored.";

    if (dataSourceView) {
      successMessage =
        "The transcripts will be stored in the folder " +
        dataSourceView.dataSource.name;
    } else {
      successMessage = "The transcripts will not be stored.";
    }

    await mutateTranscriptsConfiguration();

    sendNotification({
      title: "Updated successfully",
      type: "success",
      description: successMessage,
    });
  };

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
            if (transcriptsConfiguration) {
              await handleDisconnectProvider(transcriptsConfiguration.id);
            }
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
              transcriptsConfigurationState={transcriptsConfigurationState}
              setTranscriptsConfigurationState={
                setTranscriptsConfigurationState
              }
              isGongConnectorConnected={isGongConnectorConnected}
              handleProviderChange={handleProviderChange}
              handleConnectGoogleTranscriptsSource={() =>
                handleConnectGoogleTranscriptsSource(
                  transcriptsConfigurationState.provider
                )
              }
              handleConnectModjoTranscriptsSource={() =>
                handleConnectModjoTranscriptsSource({
                  provider: transcriptsConfigurationState.provider,
                  credentialId: transcriptsConfigurationState.credentialId,
                  defaultModjoConfiguration,
                })
              }
              setIsDeleteProviderDialogOpened={setIsDeleteProviderDialogOpened}
            />

            {isAnyTranscriptSourceConnected() && transcriptsConfiguration && (
              <>
                <StorageConfiguration
                  owner={owner}
                  transcriptsConfiguration={transcriptsConfiguration}
                  onStateChange={async () => {
                    await mutateTranscriptsConfiguration();
                  }}
                  dataSourcesViews={dataSourcesViews}
                  spaces={spaces}
                  isSpacesLoading={isSpacesLoading}
                  storeInFolder={storeInFolder}
                  handleSetStoreInFolder={handleSetStoreInFolder}
                  selectionConfigurations={selectionConfigurations}
                  handleSetSelectionConfigurations={
                    handleSetSelectionConfigurations
                  }
                />
                <ProcessingConfiguration
                  owner={owner}
                  transcriptsConfiguration={transcriptsConfiguration}
                  transcriptsConfigurationState={transcriptsConfigurationState}
                  agents={agents}
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

  function isAnyTranscriptSourceConnected() {
    return (
      transcriptsConfiguration &&
      (transcriptsConfigurationState.isGDriveConnected ||
        transcriptsConfigurationState.isModjoConnected ||
        isGongConnectorConnected)
    );
  }
}
