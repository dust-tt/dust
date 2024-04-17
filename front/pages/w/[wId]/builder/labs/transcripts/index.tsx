import {
  BookOpenIcon,
  Button,
  CloudArrowLeftRightIcon,
  Input,
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
import { useAgentConfigurations, useLabsTranscriptsConfiguration } from "@app/lib/swr";

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

  const { labsConfiguration, islabsConfigurationLoading } = useLabsTranscriptsConfiguration({
    workspaceId: owner.sId,
    provider,
  });
  const [configurationState, setConfigurationState] = useState<{
    isGDriveConnected: boolean,
    assistantSelected: LightAgentConfigurationType | null,
    emailToNotify: string,
    isActive: boolean,
  }>({
    isGDriveConnected: false,
    assistantSelected: null as LightAgentConfigurationType | null,
    emailToNotify: "",
    isActive: false,
  });

  useEffect(() => {
    setConfigurationState({
      isGDriveConnected: labsConfiguration && labsConfiguration.id > 0 || false,
      assistantSelected:  agentConfigurations.find(
        (a) => a.sId === labsConfiguration?.agentConfigurationId
      ) || null,
      emailToNotify: labsConfiguration?.emailToNotify || "",
      isActive: labsConfiguration?.isActive || false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labsConfiguration]);

  if (islabsConfigurationLoading) {
    return <Spinner2 />
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
    setConfigurationState({
      ...configurationState,
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

  const updateEmailToNotify = async (email: string) => {
    setConfigurationState({
      ...configurationState,
      emailToNotify: email,
    });
    const data = {
      email: email,
      agentConfigurationId: configurationState.assistantSelected?.sId,
      provider,
    };
    const successMessage = "The email to notify has been set to " + email;
    await makePatchRequest(data, successMessage);
  };

  const updateIsActive = async (isActive: boolean) => {
    setConfigurationState({
      ...configurationState,
      isActive,
    });
    const data = {
      isActive,
      agentConfigurationId: configurationState.assistantSelected?.sId,
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

  const handleSaveEmailToNotify = async () => {
    if (configurationState.emailToNotify) {
      return updateEmailToNotify(configurationState.emailToNotify);
    }
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
      setConfigurationState({
        ...configurationState,
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
                  label={configurationState.isGDriveConnected ? "Connected" : "Connect"}
                  size="sm"
                  icon={CloudArrowLeftRightIcon}
                  disabled={islabsConfigurationLoading || configurationState?.isGDriveConnected}
                  onClick={async () => {
                    await handleConnectTranscriptsSource();
                  }}
                />
              </div>
            </Page.Layout>
          </Page.Layout>
          {!islabsConfigurationLoading && configurationState.isGDriveConnected && (
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
                      onItemClick={handleSelectAssistant}
                      assistants={agents}
                      showFooterButtons={false}
                    />
                    {configurationState.assistantSelected && (
                      <Page.P>
                        <strong>@{configurationState.assistantSelected.name}</strong>
                      </Page.P>
                    )}
                  </Page.Layout>
                </Page.Layout>
              </Page.Layout>
              <Page.Layout direction="vertical">
                <Page.SectionHeader title="3. Choose the email receiving transcripts" />
                <Page.Layout direction="vertical" gap="lg">
                  <Page.P>
                    By default, we will send transcripts to your email. You can
                    chose a different email here.
                  </Page.P>
                  <Page.Horizontal>
                    <div className="flex-grow">
                      <Input
                        placeholder="Type email"
                        name="input"
                        value={configurationState.emailToNotify}
                        onChange={(e) => setConfigurationState({
                          ...configurationState,
                          emailToNotify: e,
                        })}
                      />
                    </div>
                    <Button
                      label="Save"
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        await handleSaveEmailToNotify();
                      }}
                    />
                  </Page.Horizontal>
                </Page.Layout>
              </Page.Layout>
              <Page.Layout direction="vertical">
                <Page.SectionHeader title="4. Enable transcripts processing" />
                <Page.Layout direction="horizontal" gap="xl">
                  <SliderToggle
                    selected={configurationState.isActive}
                    onClick={() => handleSetIsActive(!configurationState.isActive)}
                  />
                  <Page.P>
                    When enabled, each new meeting transcript in 'My Drive' will
                    be processed.
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
