import type {
  DataSourceType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import WebsiteConfiguration from "@app/components/data_source/WebsiteConfiguration";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
  gaTrackingId: string;
}>(async (context, auth) => {
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
      dataSources: dataSources.map((ds) => ds.toJSON()),
      gaTrackingId: config.getGaTrackingId(),
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
