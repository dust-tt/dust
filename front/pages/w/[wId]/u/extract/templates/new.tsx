import type { WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { ExtractEventSchemaForm } from "@app/components/use/EventSchemaForm";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  gaTrackingId: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isBuilder() || !subscription) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      readOnly: !auth.isBuilder(),
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function AppExtractEventsCreate({
  owner,
  subscription,
  readOnly,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      subNavigation={subNavigationBuild({ owner, current: "extract" })}
    >
      <ExtractEventSchemaForm owner={owner} readOnly={readOnly} />
    </AppLayout>
  );
}
