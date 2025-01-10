import {
  BracesIcon,
  Button,
  CommandLineIcon,
  DataTable,
  PlusIcon,
  SearchInput,
  Spinner,
  usePaginationFromUrl,
} from "@dust-tt/sparkle";
import type { ConnectorType, SpaceType, WorkspaceType } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { sortBy } from "lodash";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useRef } from "react";
import { useState } from "react";
import * as React from "react";

import { SpaceCreateAppModal } from "@app/components/spaces/SpaceCreateAppModal";
import { useApps } from "@app/lib/swr/apps";

type RowData = {
  category: string;
  name: string;
  icon: ComponentType;
  connector?: ConnectorType;
  fetchConnectorError?: string;
  workspaceId: string;
  onClick?: () => void;
};

const getTableColumns = () => {
  return [
    {
      id: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent icon={info.row.original.icon}>
          {info.getValue()}
        </DataTable.CellContent>
      ),
      accessorFn: (row: RowData) => row.name,
    },
  ];
};

interface SpaceAppsListProps {
  canWriteInSpace: boolean;
  onSelect: (sId: string) => void;
  owner: WorkspaceType;
  space: SpaceType;
}

export const SpaceAppsList = ({
  owner,
  canWriteInSpace,
  space,
  onSelect,
}: SpaceAppsListProps) => {
  const router = useRouter();
  const [isCreateAppModalOpened, setIsCreateAppModalOpened] = useState(false);

  const [appSearch, setAppSearch] = useState<string>("");

  const { apps, isAppsLoading } = useApps({ owner, space });

  const searchBarRef = useRef<HTMLInputElement>(null);

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
  });

  const rows: RowData[] = React.useMemo(
    () =>
      sortBy(apps, "name").map((app) => ({
        sId: app.sId,
        category: "apps",
        name: app.name,
        icon: CommandLineIcon,
        workspaceId: owner.sId,
        onClick: () => onSelect(app.sId),
      })) || [],
    [apps, onSelect, owner]
  );

  if (isAppsLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      {rows.length === 0 ? (
        <div className="flex h-36 w-full max-w-4xl items-center justify-center gap-2 rounded-lg border bg-structure-50">
          <Button
            label="Create App"
            disabled={!canWriteInSpace}
            onClick={() => {
              setIsCreateAppModalOpened(true);
            }}
          />
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <SearchInput
              name="search"
              ref={searchBarRef}
              placeholder="Search (Name)"
              value={appSearch}
              onChange={(s) => {
                setAppSearch(s);
              }}
            />
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
          </div>
          <DataTable
            data={rows}
            columns={getTableColumns()}
            className="pb-4"
            filter={appSearch}
            filterColumn="name"
            pagination={pagination}
            setPagination={setPagination}
          />
        </>
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
