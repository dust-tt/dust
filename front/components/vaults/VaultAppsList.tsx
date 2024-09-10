import {
  Button,
  CommandLineIcon,
  DataTable,
  PlusIcon,
  Searchbar,
  Spinner,
  usePaginationFromUrl,
} from "@dust-tt/sparkle";
import type { ConnectorType, WorkspaceType } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import type { ComponentType } from "react";
import { useRef } from "react";
import { useState } from "react";
import * as React from "react";

import { ManageAppSecretsButtonModal } from "@app/components/app/ManageAppSecretsButtonModal";
import { VaultCreateAppModal } from "@app/components/vaults/VaultCreateAppModal";
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

type VaultAppListProps = {
  owner: WorkspaceType;
  isBuilder: boolean;
  onSelect: (sId: string) => void;
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

export const VaultAppsList = ({
  owner,
  isBuilder,
  onSelect,
}: VaultAppListProps) => {
  const [isCreateAppModalOpened, setIsCreateAppModalOpened] = useState(false);

  const [appSearch, setAppSearch] = useState<string>("");

  const { apps, isAppsLoading } = useApps(owner);

  const searchBarRef = useRef<HTMLInputElement>(null);

  const { pagination, setPagination } = usePaginationFromUrl({
    urlPrefix: "table",
  });

  const rows: RowData[] = React.useMemo(
    () =>
      apps?.map((app) => ({
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
            disabled={!isBuilder}
            onClick={() => {
              setIsCreateAppModalOpened(true);
            }}
          />
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Searchbar
              name="search"
              ref={searchBarRef}
              placeholder="Search (Name)"
              value={appSearch}
              onChange={(s) => {
                setAppSearch(s);
              }}
            />
            {isBuilder && (
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
                <ManageAppSecretsButtonModal owner={owner} />
              </>
            )}
          </div>
          <DataTable
            data={rows}
            columns={getTableColumns()}
            filter={appSearch}
            filterColumn="name"
            pagination={pagination}
            setPagination={setPagination}
          />
        </>
      )}
      <VaultCreateAppModal
        owner={owner}
        isOpen={isCreateAppModalOpened}
        setIsOpen={setIsCreateAppModalOpened}
      />
    </>
  );
};
