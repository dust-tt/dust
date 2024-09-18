import {
  BookOpenIcon,
  Button,
  ChevronDownIcon,
  CloudArrowLeftRightIcon,
  Dialog,
  DropdownMenu,
  Page,
  SliderToggle,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { DataSourceViewType, SubscriptionType } from "@dust-tt/types";
import type { LightAgentConfigurationType } from "@dust-tt/types";
import type {
  LabsTranscriptsProviderType,
  WorkspaceType,
} from "@dust-tt/types";
import { setupOAuthConnection } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useContext, useEffect, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useConversations } from "@app/lib/swr/conversations";
import { useLabsTranscriptsConfiguration } from "@app/lib/swr/labs";
import type { PatchTranscriptsConfiguration } from "@app/pages/api/w/[wId]/labs/transcripts/[tId]";

const defaultTranscriptConfigurationState = {
  provider: "",
  isGDriveConnected: false,
  isGongConnected: false,
  assistantSelected: null,
  isActive: false,
  dataSource: null,
};

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSourcesViews: DataSourceViewType[];
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

  const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);
  const globalDataSourceViews = await DataSourceViewResource.listByVault(
    auth,
    globalVault
  );

  const dataSourcesViews = globalDataSourceViews
    .map((dsv) => dsv.toJSON())
    .filter((dsv) => !dsv.dataSource.connectorId)
    .sort((a, b) => a.dataSource.name.localeCompare(b.dataSource.name));

  if (
    !owner ||
    !owner.flags.includes("labs_transcripts") ||
    !subscription ||
    !user
  ) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      dataSourcesViews,
    },
  };
});

export default function LabsTranscriptsIndex({
  owner,
  subscription,
  dataSourcesViews,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const sendNotification = useContext(SendNotificationsContext);
  const [isDeleteProviderDialogOpened, setIsDeleteProviderDialogOpened] =
    useState(false);

  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    sort: "priority",
  });

  const {
    transcriptsConfiguration,
    isTranscriptsConfigurationLoading,
    mutateTranscriptsConfiguration,
  } = useLabsTranscriptsConfiguration({ workspaceId: owner.sId });

  const { conversations, isConversationsError } = useConversations({
    workspaceId: owner.sId,
  });

  const [transcriptsConfigurationState, setTranscriptsConfigurationState] =
    useState<{
      provider: string;
      isGDriveConnected: boolean;
      isGongConnected: boolean;
      assistantSelected: LightAgentConfigurationType | null;
      isActive: boolean;
      dataSource: DataSourceViewType | null;
    }>(defaultTranscriptConfigurationState);

  useEffect(() => {
    if (transcriptsConfiguration) {
      setTranscriptsConfigurationState((prev) => {
        return {
          ...prev,
          provider: transcriptsConfiguration.provider || "",
          isGongConnected: transcriptsConfiguration.provider == "gong" || false,
          isGDriveConnected:
            transcriptsConfiguration.provider == "google_drive" || false,
          assistantSelected:
            agentConfigurations.find(
              (a) => a.sId === transcriptsConfiguration.agentConfigurationId
            ) || null,
          isActive: transcriptsConfiguration.isActive || false,
          dataSource:
            dataSourcesViews.find(
              (ds) => ds.id === transcriptsConfiguration.dataSourceId
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
    setTranscriptsConfigurationState((prev) => {
      return {
        ...prev,
        provider,
      };
    });
    await mutateTranscriptsConfiguration();
  };

  const makePatchRequest = async (
    transcriptConfigurationId: number,
    data: Partial<PatchTranscriptsConfiguration>,
    successMessage: string
  ) => {
    const response = await fetch(
      `/api/w/${owner.sId}/labs/transcripts/${transcriptConfigurationId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      sendNotification({
        type: "error",
        title: "Failed to update",
        description: "Could not update the configuration. Please try again.",
      });
      return;
    }

    sendNotification({
      type: "success",
      title: "Success!",
      description: successMessage,
    });

    await mutateTranscriptsConfiguration();
  };

  const updateAssistant = async (
    transcriptsConfigurationId: number,
    assistant: LightAgentConfigurationType
  ) => {
    setTranscriptsConfigurationState((prev) => {
      return {
        ...prev,
        assistantSelected: assistant,
      };
    });

    const successMessage =
      "The assistant that will help you summarize your transcripts has been set to @" +
      assistant.name;
    await makePatchRequest(
      transcriptsConfigurationId,
      {
        agentConfigurationId: assistant.sId,
      },
      successMessage
    );
  };

  const updateIsActive = async (
    transcriptsConfigurationId: number,
    isActive: boolean
  ) => {
    setTranscriptsConfigurationState((prev) => {
      return {
        ...prev,
        isActive,
      };
    });

    const successMessage = isActive
      ? "We will start summarizing your meeting transcripts."
      : "We will no longer summarize your meeting transcripts.";
    await makePatchRequest(
      transcriptsConfigurationId,
      {
        isActive,
      },
      successMessage
    );
  };

  const handleSelectAssistant = async (
    transcriptConfigurationId: number,
    assistant: LightAgentConfigurationType
  ) => {
    return updateAssistant(transcriptConfigurationId, assistant);
  };

  const handleSetDataSource = async (
    transcriptConfigurationId: number,
    dataSource: DataSourceViewType | null
  ) => {
    setTranscriptsConfigurationState((prev) => {
      return {
        ...prev,
        dataSource,
      };
    });

    let successMessage = "The transcripts will not be stored.";

    if (dataSource) {
      successMessage =
        "The transcripts will be stored in the folder " +
        dataSource.dataSource.name;
    }
    await makePatchRequest(
      transcriptConfigurationId,
      {
        dataSourceId: dataSource ? dataSource.dataSource.name : null,
      },
      successMessage
    );
  };

  const handleSetIsActive = async (
    transcriptConfigurationId: number,
    isActive: boolean
  ) => {
    return updateIsActive(transcriptConfigurationId, isActive);
  };

  const saveOAuthConnection = async (
    connectionId: string,
    provider: string
  ) => {
    try {
      const response = await fetch(`/api/w/${owner.sId}/labs/transcripts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionId,
          provider,
        }),
      });
      if (!response.ok) {
        sendNotification({
          type: "error",
          title: "Failed to connect provider",
          description:
            "Could not connect to your transcripts provider. Please try again.",
        });
      } else {
        sendNotification({
          type: "success",
          title: "Provider connected",
          description:
            "Your transcripts provider has been connected successfully.",
        });

        await mutateTranscriptsConfiguration();
      }
      return response;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect provider",
        description:
          "Unexpected error trying to connect to your transcripts provider. Please try again. Error: " +
          error,
      });
    }
  };

  const handleConnectGoogleTranscriptsSource = async () => {
    if (transcriptsConfigurationState.provider !== "google_drive") {
      return;
    }

    const cRes = await setupOAuthConnection({
      dustClientFacingUrl: `${process.env.DUST_CLIENT_FACING_URL}`,
      owner,
      provider: "google_drive",
      useCase: "labs_transcripts",
    });

    if (cRes.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to connect Google Drive",
        description: cRes.error.message,
      });
      return;
    }

    await saveOAuthConnection(
      cRes.value.connection_id,
      transcriptsConfigurationState.provider
    );
  };

  const handleConnectGongTranscriptsSource = async () => {
    try {
      if (transcriptsConfigurationState.provider !== "gong") {
        return;
      }

      const response = await fetch(
        `/api/w/${owner.sId}/labs/transcripts/default?provider=gong`
      );

      if (response.ok) {
        const defaultConfigurationRes = await response.json();
        const defaultConfiguration: LabsTranscriptsConfigurationResource =
          defaultConfigurationRes.configuration;

        if (defaultConfiguration.provider !== "gong") {
          sendNotification({
            type: "error",
            title: "Failed to connect Gong",
            description:
              "Your workspace is already connected to another provider",
          });
          return;
        }

        await saveOAuthConnection(
          defaultConfiguration.connectionId,
          transcriptsConfigurationState.provider
        );

        return;
      } else {
        const cRes = await setupOAuthConnection({
          dustClientFacingUrl: `${process.env.DUST_CLIENT_FACING_URL}`,
          owner,
          provider: "gong",
          useCase: "connection",
        });
        if (!cRes.isOk()) {
          return cRes;
        }
        const connectionId = cRes.value.connection_id;

        await saveOAuthConnection(
          connectionId,
          transcriptsConfigurationState.provider
        );
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect Gong",
        description: "Could not connect to Gong. Please try again.",
      });
    }
  };

  const handleDisconnectProvider = async () => {
    if (!transcriptsConfiguration) {
      return;
    }

    const response = await fetch(
      `/api/w/${owner.sId}/labs/transcripts/${transcriptsConfiguration.id}`,
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

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      pageTitle="Dust - Transcripts processing"
      navChildren={
        <AssistantSidebarMenu
          owner={owner}
          conversations={conversations}
          isConversationsError={isConversationsError}
        />
      }
    >
      <Dialog
        isOpen={isDeleteProviderDialogOpened}
        title="Disconnect transcripts provider"
        onValidate={async () => {
          await handleDisconnectProvider();
          setIsDeleteProviderDialogOpened(false);
        }}
        onCancel={() => setIsDeleteProviderDialogOpened(false)}
      >
        <div>
          This will stop the processing of your meeting transcripts and delete
          all history. You can reconnect anytime.
        </div>
      </Dialog>
      <Page>
        <Page.Header
          title="Transcripts processing"
          icon={BookOpenIcon}
          description="Receive meeting minutes summarized by email automatically."
        />
        <Page.Layout direction="vertical">
          <Page.SectionHeader title="1. Connect your transcripts provider" />
          {!transcriptsConfiguration && (
            <Page.Layout direction="horizontal" gap="xl">
              <div
                className={`cursor-pointer rounded-md border p-4 hover:border-gray-400 ${
                  transcriptsConfigurationState.provider == "google_drive"
                    ? "border-gray-400"
                    : "border-gray-200"
                }`}
                onClick={() => handleProviderChange("google_drive")}
              >
                <img
                  src="/static/labs/transcripts/google.png"
                  style={{ maxHeight: "35px" }}
                />
              </div>
              <div
                className={`cursor-pointer rounded-md border p-4 hover:border-gray-400 ${
                  transcriptsConfigurationState.provider == "gong"
                    ? "border-gray-400"
                    : "border-gray-200"
                }`}
                onClick={() => handleProviderChange("gong")}
              >
                <img
                  src="/static/labs/transcripts/gong.jpeg"
                  style={{ maxHeight: "35px" }}
                />
              </div>
            </Page.Layout>
          )}

          {transcriptsConfigurationState.provider === "google_drive" && (
            <Page.Layout direction="vertical">
              {transcriptsConfigurationState.isGDriveConnected ? (
                <Page.Layout direction="horizontal">
                  <Button
                    label="Google connected"
                    size="sm"
                    icon={CloudArrowLeftRightIcon}
                    disabled={true}
                  />
                  <Button
                    label="Disconnect"
                    icon={XMarkIcon}
                    size="sm"
                    variant="secondary"
                    onClick={() => setIsDeleteProviderDialogOpened(true)}
                  />
                </Page.Layout>
              ) : (
                <>
                  <Page.P>
                    Connect to Google Drive so Dust can access 'My Drive' where
                    your meeting transcripts are stored.
                  </Page.P>
                  <div>
                    <Button
                      label="Connect Google"
                      size="sm"
                      icon={CloudArrowLeftRightIcon}
                      onClick={async () => {
                        await handleConnectGoogleTranscriptsSource();
                      }}
                    />
                  </div>
                </>
              )}
            </Page.Layout>
          )}
          {transcriptsConfigurationState.provider === "gong" && (
            <Page.Layout direction="vertical">
              {transcriptsConfigurationState.isGongConnected ? (
                <Page.Layout direction="horizontal">
                  <Button
                    label="Gong connected"
                    size="sm"
                    icon={CloudArrowLeftRightIcon}
                    disabled={true}
                  />
                  <Button
                    label="Disconnect"
                    icon={XMarkIcon}
                    size="sm"
                    variant="secondary"
                    onClick={() => setIsDeleteProviderDialogOpened(true)}
                  />
                </Page.Layout>
              ) : (
                <>
                  <Page.P>
                    Connect to Gong so Dust can access your meeting transcripts.
                  </Page.P>
                  <div>
                    <Button
                      label="Connect Gong"
                      size="sm"
                      icon={CloudArrowLeftRightIcon}
                      onClick={async () => {
                        await handleConnectGongTranscriptsSource();
                      }}
                    />
                  </div>
                </>
              )}
            </Page.Layout>
          )}
        </Page.Layout>
        {transcriptsConfiguration &&
          (transcriptsConfigurationState.isGDriveConnected ||
            transcriptsConfigurationState.isGongConnected) && (
            <>
              <Page.Layout direction="vertical">
                <Page.SectionHeader title="2. Choose an assistant" />
                <Page.Layout direction="vertical">
                  <Page.P>
                    Choose the assistant that will process the transcripts the
                    way you want.
                  </Page.P>
                  <Page.Layout direction="horizontal">
                    <AssistantPicker
                      owner={owner}
                      size="sm"
                      onItemClick={(assistant) =>
                        handleSelectAssistant(
                          transcriptsConfiguration.id,
                          assistant
                        )
                      }
                      assistants={agents}
                      showFooterButtons={false}
                    />
                    {transcriptsConfigurationState.assistantSelected && (
                      <Page.P>
                        <strong>
                          @
                          {transcriptsConfigurationState.assistantSelected.name}
                        </strong>
                      </Page.P>
                    )}
                  </Page.Layout>
                </Page.Layout>
              </Page.Layout>

              {owner.flags.includes("labs_transcripts_datasource") && (
                <Page.Layout direction="vertical">
                  <Page.SectionHeader title="3. Store transcripts in Folder" />
                  <Page.Layout direction="horizontal" gap="xl">
                    <Page.P>
                      Store transcripts in a Folder to keep using them in your
                      assistants?
                      <br />
                      <small>
                        Warning: this can make your transcripts public within
                        your workspace.
                      </small>
                    </Page.P>
                    {dataSourcesViews.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenu.Button
                          className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-4 py-2 text-left text-sm font-medium shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                          disabled={!transcriptsConfigurationState.isActive}
                        >
                          {transcriptsConfigurationState?.dataSource?.dataSource
                            .name || "Do not store transcripts"}
                          <ChevronDownIcon
                            className="-mr-1 ml-2 h-5 w-5"
                            aria-hidden="true"
                          />
                        </DropdownMenu.Button>
                        <DropdownMenu.Items origin="topLeft" width={220}>
                          <DropdownMenu.Item
                            label="Do not store transcripts"
                            onClick={() =>
                              handleSetDataSource(
                                transcriptsConfiguration.id,
                                null
                              )
                            }
                          />
                          {dataSourcesViews.map((dsv) => (
                            <DropdownMenu.Item
                              key={dsv.id}
                              label={dsv.dataSource.name}
                              onClick={() =>
                                handleSetDataSource(
                                  transcriptsConfiguration.id,
                                  dsv
                                )
                              }
                            />
                          ))}
                        </DropdownMenu.Items>
                      </DropdownMenu>
                    )}
                  </Page.Layout>
                </Page.Layout>
              )}

              <Page.Layout direction="vertical">
                <Page.SectionHeader title="3. Enable transcripts processing" />
                <Page.Layout direction="horizontal" gap="xl">
                  <SliderToggle
                    selected={transcriptsConfigurationState.isActive}
                    onClick={() =>
                      handleSetIsActive(
                        transcriptsConfiguration.id,
                        !transcriptsConfigurationState.isActive
                      )
                    }
                    disabled={!transcriptsConfigurationState.assistantSelected}
                  />
                  <Page.P>
                    When enabled, each new meeting transcript in 'My Drive' will
                    be processed.
                    <br />
                    Summaries can take up to 30 minutes to be sent after
                    meetings end.
                  </Page.P>
                </Page.Layout>
              </Page.Layout>
            </>
          )}
      </Page>
    </AppLayout>
  );
}
