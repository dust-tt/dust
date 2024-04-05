import {
  ChatBubbleLeftRightIcon,
  CloudArrowLeftRightIcon,
  Page,
  Spinner2
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import Nango from '@nangohq/frontend';
import type { drive_v3 } from "googleapis";
import type { InferGetServerSidePropsType } from "next";
import { useContext, useEffect, useState } from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { buildConnectionId } from "@app/lib/connector_connection_id";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

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

export default function SolutionsTranscriptsIndex({
  owner,
  subscription,
  gaTrackingId,
  nangoDriveConnectorId,
  nangoPublicKey,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [isLoading, setIsLoading] = useState(false);
  const [isGDriveConnected, setIsGDriveConnected] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  useEffect(() => {
    void fetch(`/api/w/${owner.sId}/solutions/transcripts?provider=google_drive`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error("Failed to fetch solution configuration");
      }
      const { configuration } = await response.json();
      if (configuration?.id) {
        setIsGDriveConnected(true);
      }
    }
    ).finally(() => {
      setIsLoading(false);
    })
  }, [owner]);

  const handleConnectTranscriptsSource = async () => {
    setIsLoading(true);
    try {
      // console log all variables in process.env
      const provider = "google_drive";
      const nango = new Nango({ publicKey: nangoPublicKey });
      const newConnectionId = buildConnectionId(`solutions-transcripts-${owner.sId}`, provider);
      const {
        connectionId: nangoConnectionId,
      }: { providerConfigKey: string; connectionId: string } = await nango.auth(nangoDriveConnectorId, newConnectionId);

      await fetch(`/api/w/${owner.sId}/solutions/transcripts`, {
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
          description: "Google Drive has been connected successfully."
        });
        
        return response;
      })
    } catch (error) {
      console.log(error)
      sendNotification({
        type: "error",
        title: "Failed to connect Google Drive",
        description: "Could not connect to Google Drive. Please try again."
      });
      setIsLoading(false);
    }
  }
  

  return (
    <>
      <AppLayout
        subscription={subscription}
        owner={owner}
        gaTrackingId={gaTrackingId}
        topNavigationCurrent="admin"
        subNavigation={subNavigationAdmin({ owner, current: "workspace" })}
      >
        <Page.Vertical align="stretch" gap="xl">
          <Page.Header
            title="Dust solution: Transcripts summarizer"
            icon={ChatBubbleLeftRightIcon}
            description="Receive meeting minutes summarized by email"
          />
          <Page.Separator />
          <Page.SectionHeader
            title="Connect Google Drive"
            description="Connect your personal Google Drive so Dust can access your meeting transcripts"
            action={{
              label: isGDriveConnected ? "Connected" : "Connect",
              size: "sm",
              icon: CloudArrowLeftRightIcon,
              disabled: isLoading || isGDriveConnected,
              onClick: async () => {
                await handleConnectTranscriptsSource();
              },
            }} 
          />
        </Page.Vertical>
      </AppLayout>
    </>
  );
}
