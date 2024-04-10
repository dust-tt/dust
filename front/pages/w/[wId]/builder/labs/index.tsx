import { Page, PaintIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  gaTrackingId: string;
}>(async (_context, auth) => {
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
    },
  };
});

export default function LabsIndex({
  owner,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <>
      <AppLayout
        subscription={subscription}
        owner={owner}
        gaTrackingId={gaTrackingId}
        topNavigationCurrent="assistants"
        subNavigation={subNavigationBuild({ owner, current: "labs" })}
      >
        <Page.Vertical align="stretch" gap="xl">
          <Page.Header
            title="Dust Labs"
            icon={PaintIcon}
            description="Solutions for specific use-cases - try them out and become a Dust co-builder!"
          />
          <Page.Separator />
          <Page.SectionHeader
            title="Transcripts processing"
            description="Summarize your visio calls meeting minutes automatically and receive them by email. Works with Google Meet and Gong.io"
            action={{
              label: "Get started",
              size: "sm",
              onClick: async () => {
                await router.push(`/w/${owner.sId}/builder/labs/transcripts`);
              },
            }}
          />
        </Page.Vertical>
      </AppLayout>
    </>
  );
}
