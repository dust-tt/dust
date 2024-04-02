import {
  Button,
  ChatBubbleLeftRightIcon,
  CloudArrowLeftRightIcon,
  DropdownMenu,
  Input,
  Modal,
  Page,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import Nango from '@nangohq/frontend';
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useCallback, useContext, useEffect, useState } from "react";

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
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  const handleConnectTranscriptsSource = async () => {
    setIsLoading(true);
    try {
      // console log all variables in process.env
      const provider = "google_drive";
      const nango = new Nango({ publicKey: nangoPublicKey });
      const newConnectionId = buildConnectionId(`solutions-${owner.sId}`, provider);
      const {
        connectionId: nangoConnectionId,
      }: { providerConfigKey: string; connectionId: string } = await nango.auth(nangoDriveConnectorId, newConnectionId);
      
      const connectionId: string = nangoConnectionId;
      console.log('GOT CONNECTION ID');
      console.log(connectionId);

      sendNotification({
        type: "success",
        title: "Connected Google Drive",
        description: "Google Drive has been connected successfully."
      });
      
      setIsLoading(false);
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
              label: "Connect",
              size: "sm",
              icon: CloudArrowLeftRightIcon,
              disabled: isLoading,
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
