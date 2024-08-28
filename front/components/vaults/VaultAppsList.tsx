import {
  Button,
  Chip,
  CommandLineIcon,
  DataTable,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type { ConnectorType, WorkspaceType } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import type { ComponentType } from "react";
import { useRef } from "react";
import { useState } from "react";
import * as React from "react";

import { useApps } from "@app/lib/swr";

type RowData = {
  category: string;
  name: string;
  icon: ComponentType;
  connector?: ConnectorType;
  fetchConnectorError?: string;
  visibility: string;
  workspaceId: string;
  onClick?: () => void;
};

type VaultAppListProps = {
  owner: WorkspaceType;
  onSelect: (sId: string) => void;
};

const getTableColumns = () => {
  return [
    {
      id: "Name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent icon={info.row.original.icon}>
          {info.getValue()}
        </DataTable.CellContent>
      ),
      accessorFn: (row: RowData) => row.name,
    },
    {
      id: "Visibility",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <Chip color="slate">{info.getValue()}</Chip>
        </DataTable.CellContent>
      ),
      accessorFn: (row: RowData) => row.visibility,
    },
  ];
};

export const VaultAppsList = ({ owner, onSelect }: VaultAppListProps) => {
  const [appSearch, setAppSearch] = useState<string>("");

  const { apps, isAppsLoading } = useApps(owner);

  const searchBarRef = useRef<HTMLInputElement>(null);

  const rows: RowData[] =
    apps?.map((app) => ({
      sId: app.sId,
      category: "apps",
      name: app.name,
      icon: CommandLineIcon,
      workspaceId: owner.sId,
      visibility: app.visibility === "private" ? "Private" : "Public",
      onClick: () => onSelect(app.sId),
    })) || [];

  if (isAppsLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-36 w-full max-w-4xl items-center justify-center gap-2 rounded-lg border bg-structure-50">
        <Button
          label="Create App"
          onClick={() => {
            alert("Not implemented"); // Check which role should be allowed to create an app or disable button.
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="gap-2">
        <Searchbar
          name="search"
          ref={searchBarRef}
          placeholder="Search (Name)"
          value={appSearch}
          onChange={(s) => {
            setAppSearch(s);
          }}
        />
      </div>
      <DataTable
        data={rows}
        columns={getTableColumns()}
        filter={appSearch}
        filterColumn="label"
      />
    </>
  );
};
