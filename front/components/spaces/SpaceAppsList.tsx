import {
  Button,
  CommandLineIcon,
  DataTable,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import sortBy from "lodash/sortBy";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ParsedUrlQuery } from "querystring";
import type { ComponentType } from "react";
import * as React from "react";
import { useState } from "react";

import { SpaceCreateAppModal } from "@app/components/spaces/SpaceCreateAppModal";
import { ACTION_BUTTONS_CONTAINER_ID } from "@app/components/spaces/SpacePageHeaders";
import { useActionButtonsPortal } from "@app/hooks/useActionButtonsPortal";
import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { useQueryParams } from "@app/hooks/useQueryParams";
import type { ActionApp } from "@app/lib/registry";
import { useApps, useSavedRunStatus } from "@app/lib/swr/apps";
import { removeParamFromRouter } from "@app/lib/utils/router_util";
import type {AppType, LightWorkspaceType, SpaceType, WorkspaceType} from "@app/types";
import {
  isString
} from "@app/types";

type RowData = {
  app: AppType;
  name: string;
  description: string;
  icon: ComponentType;
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
        className: "w-80",
      },
    },
    {
      id: "description",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>{info.getValue()}</DataTable.CellContent>
      ),
      accessorFn: (row: RowData) => row.description,
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

const hasOpenAppsModalQuery = (
  query: ParsedUrlQuery
): query is ParsedUrlQuery & { openAppsModal: string } =>
  isString(query.openAppsModal);

interface SpaceAppsListProps {
  isBuilder: boolean;
  onSelect: (sId: string) => void;
  owner: LightWorkspaceType;
  space: SpaceType;
  registryApps?: ActionApp[] | null;
}

export const SpaceAppsList = ({
  owner,
  isBuilder,
  space,
  onSelect,
  registryApps,
}: SpaceAppsListProps) => {
  const router = useRouter();
  const [isCreateAppModalOpened, setIsCreateAppModalOpened] = useState(false);

  const { q: searchParam } = useQueryParams(["q"]);
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const searchTerm = searchParam.value || "";

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
        description: app.description ?? "",
        icon: CommandLineIcon,
        workspaceId: owner.sId,
        onClick: () => onSelect(app.sId),
      })) || [],
    [apps, onSelect, owner]
  );

  React.useEffect(() => {
    // Extract openAppsModal query param to open modal on first render and remove it from URL
    if (!router.isReady || !isBuilder) {
      return;
    }
    const { query } = router;
    if (!hasOpenAppsModalQuery(query)) {
      return;
    }
    setIsCreateAppModalOpened(true);
    void removeParamFromRouter(router, "openAppsModal");
  }, [router.isReady, router.query.openAppsModal, isBuilder, router]);

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
      {isBuilder && (
        <Button
          label="New App"
          variant="primary"
          icon={PlusIcon}
          size="sm"
          onClick={() => {
            setIsCreateAppModalOpened(true);
          }}
        />
      )}
    </>
  );

  return (
    <>
      {!isEmpty && portalToHeader(actionButtons)}
      {isEmpty ? (
        <div className="flex h-36 w-full max-w-4xl items-center justify-center gap-2 rounded-lg bg-muted-background dark:bg-muted-background-night">
          <Button
            label="Create App"
            disabled={!isBuilder}
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
          filter={searchTerm}
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
