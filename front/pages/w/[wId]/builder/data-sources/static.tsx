import {
  Button,
  DataTable,
  FolderIcon,
  FolderOpenIcon,
  Page,
  PlusIcon,
  Popup,
  RobotIcon,
  Searchbar,
} from "@dust-tt/sparkle";
import type {
  DataSourceType,
  DataSourceWithAgentsUsageType,
  PlanType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { truncate } from "@dust-tt/types";
import type { SortingState } from "@tanstack/react-table";
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
import { getDataSources } from "@app/lib/api/data_sources";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  readOnly: boolean;
  dataSources: DataSourceType[];
  dataSourcesUsage: DataSourcesUsageByAgent;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();

  if (!owner || !plan || !subscription) {
    return {
      notFound: true,
    };
  }

  const readOnly = !auth.isBuilder();

  const dataSourcesUsage = await getDataSourcesUsageByCategory({
    auth,
    category: "folder",
  });
  const allDataSources = await getDataSources(auth, { includeEditedBy: true });
  const dataSources = allDataSources.filter((ds) => !ds.connectorId);
  return {
    props: {
      owner,
      subscription,
      plan,
      readOnly,
      dataSources: dataSources.map((ds) => ds.toJSON()),
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
      void router.push(`/w/${owner.sId}/builder/data-sources/new`);
    }
  });

  const searchBarRef = useRef<HTMLInputElement>(null);

  const columns = getTableColumns();

  const clickableDataSources = useMemo(() => {
    return dataSources.map((dataSource) => ({
      ...dataSource,
      onClick: () => {
        void router.push(
          `/w/${owner.sId}/builder/data-sources/${dataSource.sId}`
        );
      },
      icon: FolderIcon,
      usage: dataSourcesUsage[dataSource.id] || { count: 0, agentNames: [] },
    }));
  }, [dataSources, dataSourcesUsage, owner.sId, router]);
  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_static",
      })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Folders"
          icon={FolderOpenIcon}
          description="Make more documents accessible to this workspace. Manage folders manually or via API."
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
                    label="Create a folder"
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
            label="Create a new Folder"
            icon={PlusIcon}
            onClick={async () => {
              await handleCreateDataSource();
            }}
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

type RowData = DataSourceType & {
  icon: ComponentType;
  usage: DataSourceWithAgentsUsageType;
};

function getTableColumns() {
  // to please typescript
  type Info = {
    row: {
      original: RowData;
    };
  };
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
      accessorFn: (row: RowData) => row.usage.count,
      id: "usage",
      meta: {
        width: "6rem",
      },
      cell: (info: Info) => (
        <DataTable.CellContent
          icon={RobotIcon}
          title={`Used by ${info.row.original.usage.agentNames.join(", ")}`}
        >
          {info.row.original.usage.count}
        </DataTable.CellContent>
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
