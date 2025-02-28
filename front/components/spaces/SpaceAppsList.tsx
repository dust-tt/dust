import {
  BracesIcon,
  Button,
  CommandLineIcon,
  DataTable,
  PlusIcon,
  Spinner,
  usePaginationFromUrl,
} from "@dust-tt/sparkle";
import type {
  AppType,
  ConnectorType,
  LightWorkspaceType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { sortBy } from "lodash";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import * as React from "react";
import { useContext, useState } from "react";

import { SpaceCreateAppModal } from "@app/components/spaces/SpaceCreateAppModal";
import { ACTION_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { SpaceSearchContext } from "@app/components/spaces/SpaceSearchContext";
import { useActionButtonsPortal } from "@app/hooks/useActionButtonsPortal";
import type { ActionApp } from "@app/lib/registry";
import { useApps, useSavedRunStatus } from "@app/lib/swr/apps";

type RowData = {
  app: AppType;
  category: string;
  name: string;
  icon: ComponentType;
  connector?: ConnectorType;
  fetchConnectorError?: string;
  workspaceId: string;
  onClick?: () => void;
};

const getTableColumns = (): ColumnDef<RowData, string>[] => {
  return [
    {
      id: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent icon={info.row.original.icon}>
          {info.getValue()}
        </DataTable.CellContent>
      ),
      accessorFn: (row: RowData) => row.name,
      meta: {
        className: "w-full",
      },
    },
  ];
};

// A column is added for internal Dust apps, that are used to power Dust product.
// registryApp contains the list of all these Dust apps, that are expected to live in this space.
// For standard apps, if registryApps is not set, column is not displayed.
const getDustAppsColumns = (
  owner: WorkspaceType,
  registryApps: ActionApp[]
): ColumnDef<RowData, string> => ({
  id: "status",
  cell: (info: CellContext<RowData, string>) => {
    const { app } = info.row.original;
    const registryApp = Object.values(registryApps).find(
      (a) => a.appId === app.sId
    );
    if (!registryApp) {
      return (
        <DataTable.CellContent>
          <span>No registry app</span>
        </DataTable.CellContent>
      );
    }
    return (
      <DataTable.CellContent>
        <AppHashChecker owner={owner} app={app} registryApp={registryApp} />
      </DataTable.CellContent>
    );
  },
  accessorFn: (row: RowData) => row.name,
});

type AppHashCheckerProps = {
  owner: LightWorkspaceType;
  app: AppType;
  registryApp: ActionApp;
};

const AppHashChecker = ({ owner, app, registryApp }: AppHashCheckerProps) => {
  const { run, isRunError } = useSavedRunStatus(owner, app, (data) => {
    switch (data?.run?.status?.run) {
      case "running":
        return 100;
      default:
        return 0;
    }
  });

  if (
    registryApp.appHash &&
    run?.app_hash &&
    registryApp.appHash !== run.app_hash
  ) {
    return (
      <span>
        Inconsistent hashes,{" "}
        <Link
          className="text-highlight"
          href={`/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/specification?hash=${registryApp.appHash}`}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          compare
        </Link>
      </span>
    );
  }

  if (isRunError) {
    return <span>Error: {isRunError.error?.message}</span>;
  }

  if (!run) {
    return <span>No run found</span>;
  }

  if (run?.status.run === "errored") {
    return <span>Run failed</span>;
  }

  return "";
};

interface SpaceAppsListProps {
  canWriteInSpace: boolean;
  onSelect: (sId: string) => void;
  owner: LightWorkspaceType;
  space: SpaceType;
  registryApps?: ActionApp[] | null;
}

export const SpaceAppsList = ({
  owner,
  canWriteInSpace,
  space,
  onSelect,
  registryApps,
}: SpaceAppsListProps) => {
  const router = useRouter();
  const [isCreateAppModalOpened, setIsCreateAppModalOpened] = useState(false);

  const { searchTerm: appSearch } = useContext(SpaceSearchContext);

  const { apps, isAppsLoading } = useApps({ owner, space });

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
  });

  const rows: RowData[] = React.useMemo(
    () =>
      sortBy(apps, "name").map((app) => ({
        app,
        sId: app.sId,
        category: "apps",
        name: app.name,
        icon: CommandLineIcon,
        workspaceId: owner.sId,
        onClick: () => onSelect(app.sId),
      })) || [],
    [apps, onSelect, owner]
  );

  const { portalToHeader } = useActionButtonsPortal({
    containerId: ACTION_BUTTONS_CONTAINER_ID,
  });

  if (isAppsLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const columns = getTableColumns();
  if (registryApps) {
    columns.push(getDustAppsColumns(owner, registryApps));
  }

  const isEmpty = rows.length === 0;

  const actionButtons = (
    <>
      {canWriteInSpace && (
        <>
          <Button
            label="New App"
            variant="primary"
            icon={PlusIcon}
            size="sm"
            onClick={() => {
              setIsCreateAppModalOpened(true);
            }}
          />
          <Button
            label="Dev secrets"
            variant="primary"
            icon={BracesIcon}
            size="sm"
            onClick={() => {
              void router.push(`/w/${owner.sId}/developers/dev-secrets`);
            }}
          />
        </>
      )}
    </>
  );

  return (
    <>
      {!isEmpty && portalToHeader(actionButtons)}
      {isEmpty ? (
        <div className="flex h-36 w-full max-w-4xl items-center justify-center gap-2 rounded-lg bg-structure-50 dark:bg-structure-50-night">
          <Button
            label="Create App"
            disabled={!canWriteInSpace}
            onClick={() => {
              setIsCreateAppModalOpened(true);
            }}
          />
        </div>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          className="pb-4"
          filter={appSearch}
          filterColumn="name"
          pagination={pagination}
          setPagination={setPagination}
        />
      )}
      <SpaceCreateAppModal
        owner={owner}
        space={space}
        isOpen={isCreateAppModalOpened}
        setIsOpen={setIsCreateAppModalOpened}
      />
    </>
  );
};
