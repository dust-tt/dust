import {
  Button,
  DataTable,
  LinkIcon,
  Page,
  PlusIcon,
  Popup,
  RobotIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import { GlobeAltIcon } from "@dust-tt/sparkle";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
import type {
  ConnectorType,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useMemo, useRef, useState } from "react";
import * as React from "react";

import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import type { DataSourcesUsageByAgent } from "@app/lib/api/agent_data_sources";
import { getDataSourcesUsageByAgents } from "@app/lib/api/agent_data_sources";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import logger from "@app/logger/logger";

const { GA_TRACKING_ID = "" } = process.env;

type DataSourceWithConnector = DataSourceType & {
  connector: ConnectorType;
};

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  readOnly: boolean;
  dataSources: DataSourceWithConnector[];
  gaTrackingId: string;
  dataSourcesUsage: DataSourcesUsageByAgent;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();

  if (!owner || !plan || !subscription || !auth.isUser()) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();

  const allDataSources = await getDataSources(auth, { includeEditedBy: true });
  const dataSourcesUsage = await getDataSourcesUsageByAgents({
    auth,
    providerFilter: "webcrawler",
  });

  const connectorIds = allDataSources
    .filter(
      (ds) => ds.connectorProvider === "webcrawler" && ds.connectorId !== null
    )
    .map((ds) => ds.connectorId) as string[];

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const connectorsRes = await connectorsAPI.getConnectors(
    "webcrawler",
    connectorIds
  );
  if (connectorsRes.isErr()) {
    throw new Error("Failed to fetch connectors");
  }

  const dataSources = allDataSources
    .filter((ds) => ds.connectorProvider === "webcrawler")
    .map((ds) => {
      const connector = connectorsRes.value.find(
        (c) => c.id === ds.connectorId
      );
      if (!connector) {
        throw new Error("Connector not found");
      }
      return {
        ...ds,
        connector,
      };
    });

  return {
    props: {
      owner,
      subscription,
      plan,
      readOnly,
      dataSources,
      gaTrackingId: GA_TRACKING_ID,
      dataSourcesUsage,
    },
  };
});

export default function DataSourcesView({
  owner,
  subscription,
  plan,
  readOnly,
  dataSources,
  gaTrackingId,
  dataSourcesUsage,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [showDatasourceLimitPopup, setShowDatasourceLimitPopup] =
    useState(false);
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const { submit: handleCreateDataSource } = useSubmitFunction(async () => {
    // Enforce plan limits: DataSources count.
    if (
      plan.limits.dataSources.count != -1 &&
      dataSources.length >= plan.limits.dataSources.count
    ) {
      setShowDatasourceLimitPopup(true);
    } else {
      void router.push(`/w/${owner.sId}/builder/data-sources/new-public-url`);
    }
  });
  const searchBarRef = useRef<HTMLInputElement>(null);

  const columns = getTableColumns();

  const clickableDataSources = useMemo(() => {
    return dataSources.map((dataSource) => ({
      ...dataSource,
      onClick: () => {
        void router.push(
          `/w/${owner.sId}/builder/data-sources/${dataSource.name}`
        );
      },
      icon: LinkIcon,
      usage: dataSourcesUsage[dataSource.id] || 0,
    }));
  }, [dataSources, dataSourcesUsage, owner.sId, router]);

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_url",
      })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Websites"
          icon={GlobeAltIcon}
          description="Manage public URLs as data sources for the workspace."
        />

        {clickableDataSources.length > 0 ? (
          <div className="relative">
            <div className="flex flex-row gap-2">
              <Searchbar
                ref={searchBarRef}
                name="search"
                placeholder="Search (Name)"
                value={dataSourceSearch}
                onChange={(s) => {
                  setDataSourceSearch(s);
                }}
              />
              {!readOnly && (
                <Button.List>
                  <Button
                    variant="primary"
                    icon={PlusIcon}
                    label="Add a website"
                    onClick={async () => {
                      await handleCreateDataSource();
                    }}
                  />
                </Button.List>
              )}
            </div>
            <Popup
              show={showDatasourceLimitPopup}
              chipLabel={`${plan.name} plan`}
              description={`You have reached the limit of data sources (${plan.limits.dataSources.count} data sources). Upgrade your plan for unlimited datasources.`}
              buttonLabel="Check Dust plans"
              buttonClick={() => {
                void router.push(`/w/${owner.sId}/subscription`);
              }}
              onClose={() => {
                setShowDatasourceLimitPopup(false);
              }}
              className="absolute bottom-8 right-0"
            />
          </div>
        ) : (
          <EmptyCallToAction
            label="Create a new Public URL"
            onClick={handleCreateDataSource}
            icon={PlusIcon}
          />
        )}
        {clickableDataSources.length > 0 && (
          <DataTable
            data={clickableDataSources}
            columns={columns}
            filter={dataSourceSearch}
            filterColumn={"name"}
          />
        )}
      </Page.Vertical>
    </AppLayout>
  );
}

function getTableColumns() {
  // to please typescript
  type OriginalType = DataSourceType & {
    icon: ComponentType;
    usage: number;
  };
  interface Info {
    row: { original: OriginalType };
  }
  return [
    {
      header: "Name",
      accessorKey: "name",
      cell: (info: Info) => (
        <DataTable.Cell icon={info.row.original.icon}>
          {info.row.original.name}
        </DataTable.Cell>
      ),
    },
    {
      header: "Used by",
      accessorKey: "usage",
      cell: (info: Info) => (
        <DataTable.Cell icon={RobotIcon}>
          {info.row.original.usage}
        </DataTable.Cell>
      ),
    },
    {
      header: "Added by",
      cell: (info: Info) => (
        <DataTable.Cell
          avatarUrl={info.row.original.editedByUser?.imageUrl ?? ""}
        />
      ),
    },
    {
      header: "Last updated",
      accessorKey: "editedByUser.editedAt",
      cell: (info: Info) => (
        <DataTable.Cell>
          {info.row.original.editedByUser?.editedAt
            ? new Date(
                info.row.original.editedByUser.editedAt
              ).toLocaleDateString()
            : null}
        </DataTable.Cell>
      ),
    },
  ];
}
