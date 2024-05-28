import {
  BookOpenIcon,
  Button,
  CloudArrowLeftRightIcon,
  Dialog,
  Page,
  SliderToggle,
  Spinner,
  Tooltip,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  LabsTranscriptsProviderType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { LightAgentConfigurationType } from "@dust-tt/types";
import Nango from "@nangohq/frontend";
import type { InferGetServerSidePropsType } from "next";
import { useContext, useEffect, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import apiConfig from "@app/lib/api/config";
import { buildLabsConnectionId } from "@app/lib/connector_connection_id";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import config from "@app/lib/labs/config";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import {
  useAgentConfigurations,
  useLabsTranscriptsConfiguration,
} from "@app/lib/swr";
import type { PatchTranscriptsConfiguration } from "@app/pages/api/w/[wId]/labs/transcripts/[tId]";

const defaultTranscriptConfigurationState = {
  provider: "",
  isGDriveConnected: false,
  isGongConnected: false,
  assistantSelected: null,
  isActive: false,
};

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  user: UserType;
  subscription: SubscriptionType;
  gaTrackingId: string;
  nangoDriveConnectorId: string;
  nangoGongConnectorId: string;
  nangoPublicKey: string;
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

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
      user,
      subscription,
      gaTrackingId: apiConfig.getGaTrackingId(),
      nangoDriveConnectorId:
        config.getNangoConnectorIdForProvider("google_drive"),
      nangoGongConnectorId: config.getNangoConnectorIdForProvider("gong"),
      nangoPublicKey: config.getNangoPublicKey(),
    },
  };
});

export default function LabsTranscriptsIndex({
  owner,
  user,
  subscription,
  gaTrackingId,
  nangoDriveConnectorId,
  nangoGongConnectorId,
  nangoPublicKey,
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

  const [transcriptsConfigurationState, setTranscriptsConfigurationState] =
    useState<{
      provider: string;
      isGDriveConnected: boolean;
      isGongConnected: boolean;
      assistantSelected: LightAgentConfigurationType | null;
      isActive: boolean;
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
        };
      });
    } else {
      setTranscriptsConfigurationState(() => {
        return defaultTranscriptConfigurationState;
      });
    }
  }, [transcriptsConfiguration, agentConfigurations]);

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

  const handleSetIsActive = async (
    transcriptConfigurationId: number,
    isActive: boolean
  ) => {
    return updateIsActive(transcriptConfigurationId, isActive);
  };

  const saveOauthConnection = async (
    connectionId: string,
    provider: string
  ) => {
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
  };

  const handleConnectGoogleTranscriptsSource = async () => {
    try {
      if (transcriptsConfigurationState.provider !== "google_drive") {
        return;
      }
      const nango = new Nango({ publicKey: nangoPublicKey });
      const nangoConnectionId = buildLabsConnectionId(
        `labs-transcripts-workspace-${owner.id}-user-${user.id}`,
        transcriptsConfigurationState.provider
      );
      const {
        connectionId: newConnectionId,
      }: { providerConfigKey: string; connectionId: string } = await nango.auth(
        nangoDriveConnectorId,
        nangoConnectionId
      );

      await saveOauthConnection(
        newConnectionId,
        transcriptsConfigurationState.provider
      );
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect Google Drive",
        description: "Could not connect to Google Drive. Please try again.",
      });
    }
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

        await saveOauthConnection(
          defaultConfiguration.connectionId,
          transcriptsConfigurationState.provider
        );

        return;
      } else {
        const nango = new Nango({ publicKey: nangoPublicKey });

        const nangoConnectionId = buildLabsConnectionId(
          `labs-transcripts-workspace-${owner.id}`,
          transcriptsConfigurationState.provider
        );
        const {
          connectionId: newConnectionId,
        }: { providerConfigKey: string; connectionId: string } =
          await nango.auth(nangoGongConnectorId, nangoConnectionId);
        await saveOauthConnection(
          newConnectionId,
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
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="conversations"
      pageTitle="Dust - Transcripts processing"
      navChildren={<AssistantSidebarMenu owner={owner} />}
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
          This will stop the processing of your meeting transcripts. You can
          reconnect anytime.
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
              {owner.flags.includes("labs_transcripts_gong") ? (
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
              ) : (
                <Tooltip label="Gong integration coming soon. Contact us at team@dust.tt to be notified when it's ready!">
                  <div
                    className="cursor-not-allowed rounded-md border border-gray-200 p-4"
                    style={{ opacity: 0.5 }}
                  >
                    <img
                      src="/static/labs/transcripts/gong.jpeg"
                      style={{ maxHeight: "35px" }}
                    />
                  </div>
                </Tooltip>
              )}
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
                    Choose the assistant that will summarize the transcripts in
                    the way you want.
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
