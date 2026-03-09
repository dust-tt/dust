import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { DeleteProviderDialog } from "@app/components/labs/transcripts/DeleteProviderDialog";
import { ProcessingConfiguration } from "@app/components/labs/transcripts/ProcessingConfiguration";
import { ProviderSelection } from "@app/components/labs/transcripts/ProviderSelection";
import { StorageConfiguration } from "@app/components/labs/transcripts/StorageConfiguration";
import {
  useSetContentWidth,
  useSetNavChildren,
  useSetPageTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { useLabsTranscriptsConfiguration } from "@app/lib/swr/labs";
import { useSpaces } from "@app/lib/swr/spaces";
import { isProviderWithDefaultWorkspaceConfiguration } from "@app/types/oauth/lib";
import { BookOpenIcon, Breadcrumbs, Page, Spinner } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

export function TranscriptsPage() {
  const owner = useWorkspace();
  const router = useAppRouter();

  const { featureFlags } = useFeatureFlags();
  const { dataSourceViews } = useDataSourceViews(owner);

  const {
    transcriptsConfiguration,
    isTranscriptsConfigurationLoading,
    mutateTranscriptsConfiguration,
  } = useLabsTranscriptsConfiguration({ workspaceId: owner.sId });
  const [isDeleteProviderDialogOpened, setIsDeleteProviderDialogOpened] =
    useState(false);

  const { spaces, isSpacesLoading } = useSpaces({
    kinds: ["global", "regular"],
    workspaceId: owner.sId,
  });
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    sort: "priority",
  });

  const sendNotification = useSendNotification();

  // Redirect if feature flag is not enabled.
  useEffect(() => {
    if (!featureFlags.includes("labs_transcripts")) {
      void router.replace(`/w/${owner.sId}/labs`);
    }
  }, [featureFlags, owner.sId, router]);

  const handleDisconnectProvider = async (
    transcriptConfigurationId: string | null
  ) => {
    if (!transcriptConfigurationId) {
      return;
    }

    const response = await clientFetch(
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

  const isLoading =
    isTranscriptsConfigurationLoading ||
    !featureFlags.includes("labs_transcripts");

  const navChildren = useMemo(
    () => <AgentSidebarMenu owner={owner} />,
    [owner]
  );

  useSetContentWidth("centered");
  useSetPageTitle("Dust - Transcripts processing");
  useSetNavChildren(navChildren);

  return (
    <>
      {isLoading ? (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
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
                setIsDeleteProviderDialogOpened={
                  setIsDeleteProviderDialogOpened
                }
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
                      dataSourcesViews={dataSourceViews}
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
        </>
      )}
    </>
  );
}
