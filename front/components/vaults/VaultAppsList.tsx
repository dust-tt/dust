import {
  Chip,
  CommandLineIcon,
  DataTable,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  ConnectorType,
  DataSourceViewCategory,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import type { ComponentType } from "react";
import { useRef } from "react";
import { useState } from "react";
import * as React from "react";

import { useApps } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

type RowData = {
  category: string;
  label: string;
  icon: ComponentType;
  connector?: ConnectorType;
  fetchConnectorError?: string;
  visibility: string;
  workspaceId: string;
  onClick?: () => void;
};

type Info = CellContext<RowData, unknown>;

type VaultResourcesListProps = {
  owner: WorkspaceType;
  plan: PlanType;
  isAdmin: boolean;
  vault: VaultType;
  systemVault: VaultType;
  category: DataSourceViewCategory;
  onSelect: (sId: string) => void;
};

const getTableColumns = () => {
  return [
    {
      header: "Name",
      accessorKey: "label",
      id: "label",
      cell: (info: Info) => (
        <DataTable.CellContent icon={info.row.original.icon}>
          <span className="font-bold">{info.row.original.label}</span>
        </DataTable.CellContent>
      ),
    },
    {
      header: "Visibility",
      cell: (info: Info) => (
        <DataTable.CellContent>
          <Chip color="slate">
            {info.row.original.visibility === "private" ? "Private" : "Public"}
          </Chip>
        </DataTable.CellContent>
      ),
    },
  ];
};

export const VaultAppsList = ({
  owner,
  isAdmin,
  onSelect,
}: VaultResourcesListProps) => {
  const [appSearch, setAppSearch] = useState<string>("");

  const { apps, isAppsLoading } = useApps(owner);

  const searchBarRef = useRef<HTMLInputElement>(null);

  const rows: RowData[] =
    apps?.map((app) => ({
      sId: app.sId,
      category: "apps",
      label: app.name,
      icon: CommandLineIcon,
      workspaceId: owner.sId,
      visibility: app.visibility,
      onClick: () => onSelect(app.sId),
    })) || [];

  if (isAppsLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div
      className={classNames(
        "flex gap-2",
        rows.length === 0 && isAdmin
          ? "h-36 w-full max-w-4xl items-center justify-center rounded-lg border bg-structure-50"
          : ""
      )}
    >
      {rows.length > 0 ? (
        <>
          <Searchbar
            name="search"
            ref={searchBarRef}
            placeholder="Search (Name)"
            value={appSearch}
            onChange={(s) => {
              setAppSearch(s);
            }}
          />
          <DataTable
            data={rows}
            columns={getTableColumns()}
            filter={appSearch}
            filterColumn="label"
          />
        </>
      ) : (
        <div className="flex items-center justify-center text-sm font-normal text-element-700">
          No available Dust Apps
        </div>
      )}
    </div>
  );
};
