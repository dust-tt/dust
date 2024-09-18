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
import type {
  ConnectorType,
  DataSourceType,
  DataSourceWithAgentsUsageType,
  PlanType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { removeNulls, truncate } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { Row, SortingState } from "@tanstack/react-table";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useMemo, useRef, useState } from "react";
import * as React from "react";

import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import { subNavigationBuild } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import type { DataSourcesUsageByAgent } from "@app/lib/api/agent_data_sources";
import { getDataSourcesUsageByCategory } from "@app/lib/api/agent_data_sources";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { useSubmitFunction } from "@app/lib/client/utils";
import { isWebsite } from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import logger from "@app/logger/logger";

type DataSourceWithConnector = DataSourceType & {
  connector: ConnectorType;
};

type RowData = DataSourceType & {
  icon: ComponentType;
  usage: DataSourceWithAgentsUsageType;
};

type Info = {
  row: {
    original: RowData;
  };
};

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  readOnly: boolean;
  dataSources: DataSourceWithConnector[];
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
  const dataSourcesUsage = await getDataSourcesUsageByCategory({
    auth,
    category: "website",
  });

  const websiteDataSources = allDataSources
    .filter(isWebsite)
    .map((ds) => ds.toJSON());

  const connectorIds = websiteDataSources
    .filter((ds) => ds.connectorId !== null)
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

  const dataSourcesWithConnector = websiteDataSources.map((ds) => {
    const connector = connectorsRes.value.find((c) => c.id === ds.connectorId);
    if (!connector) {
      logger.error(
        {
          panic: true, // This is a panic because we want to fix the data. This should never happen.
          workspaceId: owner.sId,
          connectorId: ds.connectorId,
          dataSourceName: ds.name,
          dataSourceId: ds.id,
          connectorProvider: ds.connectorProvider,
        },
        "Connector not found while we still have a data source."
      );
      return null;
    }
    return {
      ...ds,
      connector,
    };
  });

  const dataSources = removeNulls(dataSourcesWithConnector);

  return {
    props: {
      owner,
      subscription,
      plan,
      readOnly,
      dataSources,
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
  dataSourcesUsage,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [showDatasourceLimitPopup, setShowDatasourceLimitPopup] =
    useState(false);
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "name", desc: false },
  ]);
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
      usage: dataSourcesUsage[dataSource.id] || { count: 0, agentNames: [] },
    }));
  }, [dataSources, dataSourcesUsage, owner.sId, router]);

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
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
              <div className="hidden w-full sm:block">
                <Searchbar
                  ref={searchBarRef}
                  name="search"
                  placeholder="Search (Name)"
                  value={dataSourceSearch}
                  onChange={(s) => {
                    setDataSourceSearch(s);
                  }}
                />
              </div>
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
            sorting={sorting}
            setSorting={setSorting}
            isServerSideSorting={false}
            columnsBreakpoints={{
              usage: "sm",
              editedAt: "sm",
            }}
          />
        )}
      </Page.Vertical>
    </AppLayout>
  );
}

function getTableColumns() {
  return [
    {
      header: "Name",
      id: "name",
      accessorKey: "name",
      cell: (info: Info) => (
        <DataTable.CellContent icon={info.row.original.icon}>
          <span className="hidden sm:inline">{info.row.original.name}</span>
          <span className="inline sm:hidden">
            {truncate(info.row.original.name, 30, "...")}
          </span>
        </DataTable.CellContent>
      ),
    },
    {
      header: "Used by",
      id: "usedBy",
      accessorFn: (row: RowData) => row.usage.count,
      meta: {
        width: "6rem",
      },
      sortingFn: (rowA: Row<RowData>, rowB: Row<RowData>) => {
        return (
          (rowA.original.usage.count ?? 0) - (rowB.original.usage.count ?? 0)
        );
      },
      cell: (info: Info) => (
        <>
          {info.row.original.usage ? (
            <DataTable.CellContent
              icon={RobotIcon}
              title={`Used by ${info.row.original.usage.agentNames.join(", ")}`}
            >
              {info.row.original.usage.count}
            </DataTable.CellContent>
          ) : null}
        </>
      ),
    },
    {
      header: "Added by",
      id: "addedBy",
      meta: {
        width: "6rem",
      },
      cell: (info: Info) => (
        <DataTable.CellContent
          avatarUrl={info.row.original.editedByUser?.imageUrl ?? ""}
          roundedAvatar={true}
        />
      ),
    },
    {
      header: "Last updated",
      accessorKey: "editedByUser.editedAt",
      id: "editedAt",
      meta: {
        width: "10rem",
      },
      cell: (info: Info) => (
        <DataTable.CellContent>
          {info.row.original.editedByUser?.editedAt
            ? new Date(
                info.row.original.editedByUser.editedAt
              ).toLocaleDateString()
            : null}
        </DataTable.CellContent>
      ),
    },
  ];
}
