import type {
  DataSourceType,
  DataSourceWithAgentsUsageType,
  SubscriptionType,
  WebCrawlerConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import WebsiteConfiguration from "@app/components/data_source/WebsiteConfiguration";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
  dataSource: DataSourceType;
  webCrawlerConfiguration: WebCrawlerConfigurationType;
  dataSourceUsage: DataSourceWithAgentsUsageType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();

  if (!auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  const { dsId } = context.params || {};
  if (typeof dsId !== "string") {
    return {
      notFound: true,
    };
  }

  const [dataSources, dataSource] = await Promise.all([
    getDataSources(auth),
    DataSourceResource.fetchByNameOrId(auth, dsId, {
      includeEditedBy: true,
      // TODO(DATASOURCE_SID): Clean-up
      origin: "data_source_builder_edit_public_url",
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
      dataSourceUsage: dataSourceUsageRes.isOk()
        ? dataSourceUsageRes.value
        : { count: 0, agentNames: [] },
    },
  };
});

export default function DataSourceNew({
  owner,
  subscription,
  dataSources,
  dataSource,
  webCrawlerConfiguration,
  dataSourceUsage,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <WebsiteConfiguration
      owner={owner}
      subscription={subscription}
      dataSources={dataSources}
      webCrawlerConfiguration={webCrawlerConfiguration}
      dataSource={dataSource}
      dataSourceUsage={dataSourceUsage}
    />
  );
}
