import type {
  DataSourceType,
  SubscriptionType,
  WebCrawlerConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import WebsiteConfiguration from "@app/components/data_source/WebsiteConfiguration";
import config from "@app/lib/api/config";
import { getDataSource, getDataSources } from "@app/lib/api/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import logger from "@app/logger/logger";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
  dataSource: DataSourceType;
  webCrawlerConfiguration: WebCrawlerConfigurationType;
  gaTrackingId: string;
  dataSourceUsage: number;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription || !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  const [dataSources, dataSource] = await Promise.all([
    getDataSources(auth),
    getDataSource(auth, context.params?.name as string, {
      includeEditedBy: true,
    }),
  ]);

  if (!dataSource) {
    return {
      notFound: true,
    };
  }
  if (
    dataSource.connectorProvider !== "webcrawler" ||
    dataSource.connectorId === null
  ) {
    return {
      notFound: true,
    };
  }

  const [connectorRes, dataSourceUsageRes] = await Promise.all([
    new ConnectorsAPI(config.getConnectorsAPIConfig(), logger).getConnector(
      dataSource.connectorId
    ),
    dataSource.getUsagesByAgents(auth),
  ]);

  if (connectorRes.isErr()) {
    throw new Error(connectorRes.error.message);
  }

  return {
    props: {
      owner,
      subscription,
      dataSources: dataSources.map((ds) => ds.toJSON()),
      dataSource: dataSource.toJSON(),
      webCrawlerConfiguration: connectorRes.value
        .configuration as WebCrawlerConfigurationType,
      gaTrackingId: config.getGaTrackingId(),
      dataSourceUsage: dataSourceUsageRes.isOk() ? dataSourceUsageRes.value : 0,
    },
  };
});

export default function DataSourceNew({
  owner,
  subscription,
  dataSources,
  dataSource,
  gaTrackingId,
  webCrawlerConfiguration,
  dataSourceUsage,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <WebsiteConfiguration
      owner={owner}
      subscription={subscription}
      dataSources={dataSources}
      gaTrackingId={gaTrackingId}
      webCrawlerConfiguration={webCrawlerConfiguration}
      dataSource={dataSource}
      dataSourceUsage={dataSourceUsage}
    />
  );
}
