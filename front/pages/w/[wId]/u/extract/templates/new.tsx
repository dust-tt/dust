import type { WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { ExtractEventSchemaForm } from "@app/components/use/EventSchemaForm";
import { Authenticator, getSession } from "@app/lib/auth";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withGetServerSidePropsLogging<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  readOnly: boolean;
  gaTrackingId: string;
}>(async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

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
