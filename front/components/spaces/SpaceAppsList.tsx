import {
  Button,
  CommandLineIcon,
  DataTable,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import sortBy from "lodash/sortBy";
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
import { useApps } from "@app/lib/swr/apps";
import { removeParamFromRouter } from "@app/lib/utils/router_util";
import type { AppType, LightWorkspaceType, SpaceType } from "@app/types";
import { isString } from "@app/types";

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

const hasAppsModalQuery = (
  query: ParsedUrlQuery
): query is ParsedUrlQuery & { modal: string } =>
  isString(query.modal) && query.modal === "apps";

interface SpaceAppsListProps {
  isBuilder: boolean;
  onSelect: (sId: string) => void;
  owner: LightWorkspaceType;
  space: SpaceType;
}

export const SpaceAppsList = ({
  owner,
  isBuilder,
  space,
  onSelect,
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
    // Extract modal=apps query param to open modal on first render and remove it from URL
    if (!router.isReady || !isBuilder) {
      return;
    }
    const { query } = router;
    if (!hasAppsModalQuery(query)) {
      return;
    }
    setIsCreateAppModalOpened(true);
    void removeParamFromRouter(router, "modal");
  }, [router.isReady, router.query.modal, isBuilder, router]);

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
        <div className="flex h-36 w-full items-center justify-center gap-2 rounded-lg bg-muted-background dark:bg-muted-background-night">
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
