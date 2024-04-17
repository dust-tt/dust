import {
  BookOpenIcon,
  Button,
  CloudArrowLeftRightIcon,
  Input,
  Page,
  SliderToggle,
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
import { buildConnectionId } from "@app/lib/connector_connection_id";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAgentConfigurations } from "@app/lib/swr";

const provider = "google_drive";

const {
  GA_TRACKING_ID = "",
  NANGO_GOOGLE_DRIVE_CONNECTOR_ID = "",
  NANGO_PUBLIC_KEY = "",
} = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  gaTrackingId: string;
  nangoDriveConnectorId: string;
  nangoPublicKey: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isAdmin() || !subscription) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      gaTrackingId: GA_TRACKING_ID,
      nangoDriveConnectorId: NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
      nangoPublicKey: NANGO_PUBLIC_KEY,
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
  const [isLoading, setIsLoading] = useState(false);
  const [isGDriveConnected, setIsGDriveConnected] = useState(false);
  const [assistantSelected, setAssistantSelected] =
    useState<LightAgentConfigurationType | null>(null);
  const sendNotification = useContext(SendNotificationsContext);
  const [emailToNotify, setEmailToNotify] = useState<string | null>("");
  const [agentsFetched, setAgentsFetched] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    sort: "priority",
  });

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
        throw new Error("Failed to update");
      }
      sendNotification({
        type: "success",
        title: "Success!",
        description: successMessage,
      });
    });
  };

  const updateAssistant = async (assistant: LightAgentConfigurationType) => {
    setAssistantSelected(assistant);
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
    setEmailToNotify(email);
    const data = {
      email: email,
      agentConfigurationId: assistantSelected?.sId,
      provider,
    };
    const successMessage = "The email to notify has been set to " + email;
    await makePatchRequest(data, successMessage);
  };

  const updateIsActive = async (isActive: boolean) => {
    setIsActive(isActive);
    const data = {
      isActive,
      agentConfigurationId: assistantSelected?.sId,
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
    if (emailToNotify) {
      return updateEmailToNotify(emailToNotify);
    }
  };

  const handleSetIsActive = async (isActive: boolean) => {
    return updateIsActive(isActive);
  };

  useEffect(() => {
    if (agentConfigurations.length > 0) {
      setAgentsFetched(true);
    }
  }, [agentConfigurations]);

  useEffect(() => {
    void fetch(`/api/w/${owner.sId}/labs/transcripts?provider=` + provider, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch solution configuration");
        }
        const { configuration } = await response.json();
        if (configuration?.id) {
          setIsGDriveConnected(true);
        }

        if (configuration?.agentConfigurationId) {
          setAssistantSelected(
            agentConfigurations.find(
              (a) => a.sId === configuration.agentConfigurationId
            ) || null
          );
        }

        if (configuration?.emailToNotify) {
          setEmailToNotify(configuration.emailToNotify);
        }

        if (configuration?.isActive !== undefined) {
          setIsActive(configuration.isActive);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentsFetched]);

  const handleConnectTranscriptsSource = async () => {
    setIsLoading(true);
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

      await fetch(`/api/w/${owner.sId}/labs/transcripts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionId: nangoConnectionId,
          provider,
        }),
      }).then((response) => {
        if (!response.ok) {
          throw new Error("Failed to connect Google Drive");
        }
        sendNotification({
          type: "success",
          title: "Connected Google Drive",
          description: "Google Drive has been connected successfully.",
        });

        setIsGDriveConnected(true);
        setIsLoading(false);
        return response;
      });
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect Google Drive",
        description: "Could not connect to Google Drive. Please try again.",
      });
      setIsLoading(false);
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
            <Page.Layout direction="horizontal">
              <Page.P>
                Connect to Google Drive so Dust can access 'My Drive' where your meeting transcripts are stored.
              </Page.P>

              <Button
                label={isGDriveConnected ? "Connected" : "Connect"}
                size="sm"
                icon={CloudArrowLeftRightIcon}
                disabled={isLoading || isGDriveConnected}
                onClick={async () => {
                  await handleConnectTranscriptsSource();
                }}
              />
            </Page.Layout>
          </Page.Layout>
          {!isLoading && isGDriveConnected && (
            <>
              <Page.Layout direction="vertical">
                <Page.SectionHeader title="2. Choose an assistant" />
                <Page.Layout direction="horizontal">
                  <Page.P>
                    Choose the assistant that will summarize the
                    transcripts in the way you want.
                  </Page.P>

                  <AssistantPicker
                    owner={owner}
                    size="sm"
                    onItemClick={(c) => {
                      void handleSelectAssistant(c).then(() => {
                        console.log("Selected assistant " + c.name);
                      });
                    }}
                    assistants={agents}
                    showBottomBarButtons={false}
                  />
                  {assistantSelected && (
                    <Page.P>
                      <strong>@{assistantSelected.name}</strong>
                    </Page.P>
                  )}
                </Page.Layout>
              </Page.Layout>
              <Page.Layout direction="vertical">
                <Page.SectionHeader title="3. Choose the email receiving transcripts" />
                <Page.Layout direction="horizontal" gap="xl">
                  <Page.P>
                    By default, we will send transcripts to your email. <br />You can chose a different email
                    here.
                  </Page.P>
                  <Page.Layout direction="horizontal" gap="xl">
                  <Input
                    placeholder="Type email"
                    name="input"
                    value={emailToNotify}
                    onChange={(e) => setEmailToNotify(e)}
                  />
                  <Button
                    label="Save"
                    size="sm"
                    onClick={async () => {
                      await handleSaveEmailToNotify();
                    }}
                  />
                  </Page.Layout>
                </Page.Layout>
              </Page.Layout>
              <Page.Layout direction="vertical">
                <Page.SectionHeader title="4. Enable transcripts processing" />
                <Page.Layout direction="horizontal" gap="xl">
                  <Page.P>
                    When enable, each meeting transcript in 'My Drive'  will be processed.
                  </Page.P>
                  <SliderToggle
                    selected={isActive}
                    onClick={() => handleSetIsActive(!isActive)}
                  />
                </Page.Layout>
              </Page.Layout>
            </>
          )}
        </Page>
      </AppLayout>
    </>
  );
}
