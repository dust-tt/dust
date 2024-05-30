import { ClockIcon, Page, PlusIcon } from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useState } from "react";

import { NewScheduleModal } from "@app/components/NewScheduleModal";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import apiConfig from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import config from "@app/lib/labs/config";

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
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [isFairUseModalOpened, setIsFairUseModalOpened] = useState(false);

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      pageTitle="Dust - Schedule assistant actions"
      subNavigation={subNavigationBuild({
        owner,
        current: "schedule",
      })}
    >
      <NewScheduleModal
        isOpened={isFairUseModalOpened}
        onClose={() => setIsFairUseModalOpened(false)}
        owner={owner}
      />
      <Page>
        <Page.Header
          title="Schedule assistant actions"
          icon={ClockIcon}
          description="Let your assistants run regularly and send their results to a destination of your choice."
        />

        <Page.SectionHeader
          title="Workspace schedules"
          description="Schedules that have already been created in your workspace"
          action={{
            label: "Create schedule",
            size: "sm",
            icon: PlusIcon,
            onClick: () => setIsFairUseModalOpened(true),
          }}
        />
        <Page.Layout direction="vertical">Schedules here</Page.Layout>
      </Page>
    </AppLayout>
  );
}
