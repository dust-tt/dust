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
  PlanType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { truncate } from "@dust-tt/types";
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
import { isWebsite } from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import logger from "@app/logger/logger";

type DataSourceWithConnector = DataSourceType & {
  connector: ConnectorType;
};

type Info = {
  row: {
    original: DataSourceType & {
      icon: ComponentType;
      usage: number;
    };
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
  const dataSourcesUsage = await getDataSourcesUsageByAgents({
    auth,
    providerFilter: "webcrawler",
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

  const dataSources = websiteDataSources.map((ds) => {
    const connector = connectorsRes.value.find((c) => c.id === ds.connectorId);
    if (!connector) {
      logger.error(
        {
          workspaceId: owner.sId,
          connectorId: ds.connectorId,
          dataSourceName: ds.name,
          connectorProvider: ds.connectorProvider,
        },
        "Connector not found"
      );
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
            initialColumnOrder={[{ id: "name", desc: false }]}
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
      accessorKey: "usage",
      id: "usage",
      cell: (info: Info) => (
        <DataTable.CellContent icon={RobotIcon}>
          {info.row.original.usage}
        </DataTable.CellContent>
      ),
    },
    {
      header: "Added by",
      id: "addedBy",
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
