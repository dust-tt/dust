import type {
  DataSourceType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import WebsiteConfiguration from "@app/components/data_source/WebsiteConfiguration";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator } from "@app/lib/auth";
import { withDefaultGetServerSidePropsRequirements } from "@app/lib/iam/session";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultGetServerSidePropsRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
  gaTrackingId: string;
}>(async (context, session) => {
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription || !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  const dataSources = await getDataSources(auth);

  return {
    props: {
      owner,
      subscription,
      dataSources,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function DataSourceNew({
  owner,
  subscription,
  dataSources,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <WebsiteConfiguration
      owner={owner}
      subscription={subscription}
      dataSources={dataSources}
      gaTrackingId={gaTrackingId}
      webCrawlerConfiguration={null}
      dataSource={null}
    />
  );
}
