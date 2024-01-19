import type { WorkspaceType } from "@dust-tt/types";
import type { EventSchemaType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { ExtractEventSchemaForm } from "@app/components/use/EventSchemaForm";
import { getEventSchema } from "@app/lib/api/extract";
import { Authenticator, getSession } from "@app/lib/auth";

const { GA_TRACKING_ID = "" } = process.env;
export const getServerSideProps: GetServerSideProps<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  schema: EventSchemaType;
  readOnly: boolean;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription || !auth.isUser()) {
    return {
      notFound: true,
    };
  }

  const schema = await getEventSchema({
    auth,
    sId: context.params?.sId as string,
  });

  if (!schema) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      schema,
      readOnly: !auth.isBuilder(),
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AppExtractEventsUpdate({
  owner,
  subscription,
  schema,
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
      <ExtractEventSchemaForm
        owner={owner}
        schema={schema}
        readOnly={readOnly}
      />
    </AppLayout>
  );
}
