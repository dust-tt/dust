import {
  Button,
  FolderIcon,
  FolderOpenIcon,
  Page,
  PlusIcon,
  Popup,
  RobotIcon,
  Searchbar,
  Table,
  TableData,
} from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import type { PlanType, SubscriptionType } from "@dust-tt/types";
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
import { getDataSources } from "@app/lib/api/data_sources";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  readOnly: boolean;
  dataSources: DataSourceType[];
  gaTrackingId: string;
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

  const dataSourcesUsage = await getDataSourcesUsageByAgents({
    auth,
    providerFilter: null,
  });
  const allDataSources = await getDataSources(auth, { includeEditedBy: true });
  const dataSources = allDataSources.filter((ds) => !ds.connectorId);
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
      void router.push(`/w/${owner.sId}/builder/data-sources/new`);
    }
  });

  const searchBarRef = useRef<HTMLInputElement>(null);

  const columns = getTableColumns();

  const clickableDataSources = useMemo(() => {
    return dataSources.map((dataSource) => ({
      ...dataSource,
      clickable: true,
      onClick: () => {
        void router.push(
          `/w/${owner.sId}/builder/data-sources/${dataSource.name}`
        );
      },
      icon: FolderIcon,
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
          <Table
            data={clickableDataSources}
            columns={columns}
            width="expanded"
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
        <TableData.Cell icon={info.row.original.icon}>
          {info.row.original.name}
        </TableData.Cell>
      ),
    },
    {
      header: "Used by",
      accessorKey: "usage",
      cell: (info: Info) => (
        <TableData.Cell icon={RobotIcon}>
          {info.row.original.usage}
        </TableData.Cell>
      ),
    },
    {
      header: "Added by",
      cell: (info: Info) => (
        <TableData.Cell
          avatarUrl={info.row.original.editedByUser?.imageUrl ?? ""}
        />
      ),
    },
    {
      header: "Last updated",
      accessorKey: "editedByUser.editedAt",
      cell: (info: Info) => (
        <TableData.Cell>
          {info.row.original.editedByUser?.editedAt
            ? new Date(
                info.row.original.editedByUser.editedAt
              ).toLocaleDateString()
            : null}
        </TableData.Cell>
      ),
    },
  ];
}
