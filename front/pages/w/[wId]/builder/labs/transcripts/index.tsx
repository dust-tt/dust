import {
  BookOpenIcon,
  Button,
  CloudArrowLeftRightIcon,
  Page,
  SliderToggle,
  Spinner2,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { LightAgentConfigurationType } from "@dust-tt/types";
import Nango from "@nangohq/frontend";
import type { InferGetServerSidePropsType } from "next";
import { useContext, useEffect, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import apiConfig from "@app/lib/api/config";
import { buildConnectionId } from "@app/lib/connector_connection_id";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import config from "@app/lib/labs/config";
import {
  useAgentConfigurations,
  useLabsTranscriptsConfiguration,
} from "@app/lib/swr";

const provider = "google_drive";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  gaTrackingId: string;
  nangoDriveConnectorId: string;
  nangoPublicKey: string;
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      gaTrackingId: apiConfig.getGaTrackingId(),
      nangoDriveConnectorId: config.getNangoGoogleDriveConnectorId(),
      nangoPublicKey: config.getNangoPublicKey(),
    },
  };
});

export default function LabsTranscriptsIndex({
  owner,
  subscription,
  gaTrackingId,
  nangoDriveConnectorId,
  nangoPublicKey,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const sendNotification = useContext(SendNotificationsContext);

  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    sort: "priority",
  });

  const { labsConfiguration, islabsConfigurationLoading } =
    useLabsTranscriptsConfiguration({
      workspaceId: owner.sId,
      provider,
    });

  const [transcriptsConfigurationState, setTranscriptsConfigurationState] =
    useState<{
      isGDriveConnected: boolean;
      assistantSelected: LightAgentConfigurationType | null;
      emailToNotify: string;
      isActive: boolean;
    }>({
      isGDriveConnected: false,
      assistantSelected: null as LightAgentConfigurationType | null,
      emailToNotify: "",
      isActive: false,
    });

  useEffect(() => {
    setTranscriptsConfigurationState({
      isGDriveConnected:
        (labsConfiguration && labsConfiguration.id > 0) || false,
      assistantSelected:
        agentConfigurations.find(
          (a) => a.sId === labsConfiguration?.agentConfigurationId
        ) || null,
      emailToNotify: labsConfiguration?.emailToNotify || "",
      isActive: labsConfiguration?.isActive || false,
    });
  }, [labsConfiguration, agentConfigurations]);

  if (islabsConfigurationLoading) {
    return <Spinner2 />;
  }

  const agents = agentConfigurations.filter((a) => a.status === "active");

  const makePatchRequest = async (data: any, successMessage: string) => {
    await fetch(`/api/w/${owner.sId}/labs/transcripts`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then((response) => {
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
    });
  };

  const updateAssistant = async (assistant: LightAgentConfigurationType) => {
    setTranscriptsConfigurationState({
      ...transcriptsConfigurationState,
      assistantSelected: assistant,
    });
    const data = {
      agentConfigurationId: assistant.sId,
      provider,
    };
    const successMessage =
      "The assistant that will help you summarize your transcripts has been set to @" +
      assistant.name;
    await makePatchRequest(data, successMessage);
  };

  const updateIsActive = async (isActive: boolean) => {
    setTranscriptsConfigurationState({
      ...transcriptsConfigurationState,
      isActive,
    });
    const data = {
      isActive,
      agentConfigurationId:
        transcriptsConfigurationState.assistantSelected?.sId,
      provider,
    };
    const successMessage = isActive
      ? "We will start summarizing your transcripts."
      : "We will no longer summarize your transcripts.";
    await makePatchRequest(data, successMessage);
  };

  const handleSelectAssistant = async (
    assistant: LightAgentConfigurationType
  ) => {
    return updateAssistant(assistant);
  };

  const handleSetIsActive = async (isActive: boolean) => {
    return updateIsActive(isActive);
  };

  const saveGoogleDriveConnection = async (connectionId: string) => {
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
        title: "Failed to connect Google Drive",
        description: "Could not connect to Google Drive. Please try again.",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Connected Google Drive",
        description: "Google Drive has been connected successfully.",
      });
      setTranscriptsConfigurationState({
        ...transcriptsConfigurationState,
        isGDriveConnected: true,
      });
    }

    return response;
  };

  const handleConnectTranscriptsSource = async () => {
    try {
      const nango = new Nango({ publicKey: nangoPublicKey });
      const newConnectionId = buildConnectionId(
        `labs-transcripts-${owner.sId}`,
        provider
      );
      const {
        connectionId: nangoConnectionId,
      }: { providerConfigKey: string; connectionId: string } = await nango.auth(
        nangoDriveConnectorId,
        newConnectionId
      );

      await saveGoogleDriveConnection(nangoConnectionId);
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect Google Drive",
        description: "Could not connect to Google Drive. Please try again.",
      });
    }
  };

  return (
    <>
      <AppLayout
        subscription={subscription}
        owner={owner}
        gaTrackingId={gaTrackingId}
        topNavigationCurrent="assistants"
        subNavigation={subNavigationBuild({ owner, current: "transcripts" })}
        pageTitle="Dust - Transcripts processing"
      >
        <Page>
          <Page.Header
            title="Transcripts processing"
            icon={BookOpenIcon}
            description="Receive meeting minutes summarized by email automatically. Works with Google Meet and Gong.io."
          />
          <Page.Layout direction="vertical">
            <Page.SectionHeader title="1. Connect Google Drive" />
            <Page.Layout direction="vertical">
              <Page.P>
                Connect to Google Drive so Dust can access 'My Drive' where your
                meeting transcripts are stored.
              </Page.P>
              <div>
                <Button
                  label={
                    transcriptsConfigurationState.isGDriveConnected
                      ? "Connected"
                      : "Connect"
                  }
                  size="sm"
                  icon={CloudArrowLeftRightIcon}
                  disabled={
                    islabsConfigurationLoading ||
                    transcriptsConfigurationState?.isGDriveConnected
                  }
                  onClick={async () => {
                    await handleConnectTranscriptsSource();
                  }}
                />
              </div>
            </Page.Layout>
          </Page.Layout>
          {!islabsConfigurationLoading &&
            transcriptsConfigurationState.isGDriveConnected && (
              <>
                <Page.Layout direction="vertical">
                  <Page.SectionHeader title="2. Choose an assistant" />
                  <Page.Layout direction="vertical">
                    <Page.P>
                      Choose the assistant that will summarize the transcripts
                      in the way you want.
                    </Page.P>
                    <Page.Layout direction="horizontal">
                      <AssistantPicker
                        owner={owner}
                        size="sm"
                        onItemClick={handleSelectAssistant}
                        assistants={agents}
                        showFooterButtons={false}
                      />
                      {transcriptsConfigurationState.assistantSelected && (
                        <Page.P>
                          <strong>
                            @
                            {
                              transcriptsConfigurationState.assistantSelected
                                .name
                            }
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
                          !transcriptsConfigurationState.isActive
                        )
                      }
                    />
                    <Page.P>
                      When enabled, each new meeting transcript in 'My Drive'
                      will be processed.
                    </Page.P>
                  </Page.Layout>
                </Page.Layout>
              </>
            )}
        </Page>
      </AppLayout>
    </>
  );
}
