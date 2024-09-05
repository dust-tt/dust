import type { Meta } from "@storybook/react";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import React, { useMemo } from "react";

import { DropdownItemProps } from "@sparkle/components/DropdownMenu";
import { Input } from "@sparkle/components/Input";

import { DataTable, FolderIcon } from "../index_with_tw_base";

const meta = {
  title: "Components/DataTable",
  component: DataTable,
} satisfies Meta<typeof DataTable>;

export default meta;

type Data = {
  name: string;
  description?: string;
  usedBy: number;
  addedBy: string;
  lastUpdated: string;
  size: string;
  avatarUrl?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  moreMenuItems?: DropdownItemProps[];
  roundedAvatar?: boolean;
};

const data: Data[] = [
  {
    name: "Marketing",
    description: "(23 items)",
    usedBy: 8,
    addedBy: "User1",
    lastUpdated: "July 8, 2023",
    size: "32kb",
    avatarUrl: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
    roundedAvatar: true,
    onClick: () => console.log("hehe"),
  },
  {
    name: "Design",
    usedBy: 2,
    addedBy: "User2",
    lastUpdated: "2023-07-09",
    size: "64kb",
    icon: FolderIcon,
    moreMenuItems: [
      {
        label: "Edit",
        onClick: () => console.log("Edit"),
      },
    ],
  },
  {
    name: "design",
    usedBy: 3,
    addedBy: "User21",
    lastUpdated: "2023-07-09",
    size: "64kb",
    icon: FolderIcon,
    moreMenuItems: [
      {
        label: "Edit",
        onClick: () => console.log("Edit"),
      },
    ],
  },
  {
    name: "Development",
    usedBy: 5,
    addedBy: "User3",
    lastUpdated: "2023-07-07",
    size: "128kb",
  },
  {
    name: "Sales",
    usedBy: 10,
    addedBy: "User4",
    lastUpdated: "2023-07-10",
    size: "16kb",
  },
  {
    name: "HR",
    usedBy: 3,
    addedBy: "User5",
    lastUpdated: "2023-07-06",
    size: "48kb",
  },
];

const columns: ColumnDef<Data>[] = [
  {
    accessorKey: "name",
    header: "Name",
    sortingFn: "text",
    cell: (info) => (
      <DataTable.CellContent
        avatarUrl={info.row.original.avatarUrl}
        icon={info.row.original.icon}
        description={info.row.original.description}
        roundedAvatar={info.row.original.roundedAvatar}
      >
        {info.row.original.name}
      </DataTable.CellContent>
    ),
  },
  {
    accessorKey: "usedBy",
    header: "Used by",
    cell: (info) => (
      <DataTable.CellContent>{info.row.original.usedBy}</DataTable.CellContent>
    ),
  },
  {
    accessorKey: "addedBy",
    header: "Added by",
    cell: (info) => (
      <DataTable.CellContent>{info.row.original.addedBy}</DataTable.CellContent>
    ),
  },
  {
    accessorKey: "lastUpdated",
    header: "Last updated",
    cell: (info) => (
      <DataTable.CellContent>
        {info.row.original.lastUpdated}
      </DataTable.CellContent>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: (info) => (
      <DataTable.CellContent>{info.row.original.size}</DataTable.CellContent>
    ),
  },
];

export const DataTableExample = () => {
  const [filter, setFilter] = React.useState<string>("");

  return (
    <div className="s-w-full s-max-w-4xl s-overflow-x-auto">
      <Input
        name="filter"
        placeholder="Filter"
        value={filter}
        onChange={(v) => setFilter(v)}
      />
      <DataTable
        data={data}
        filter={filter}
        filterColumn="name"
        columns={columns}
      />
    </div>
  );
};

export const DataTablePaginatedExample = () => {
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 2,
  });
  const [filter, setFilter] = React.useState<string>("");

  return (
    <div className="s-w-full s-max-w-4xl s-overflow-x-auto">
      <Input
        name="filter"
        placeholder="Filter"
        value={filter}
        onChange={(v) => setFilter(v)}
      />
      <DataTable
        data={data}
        filter={filter}
        filterColumn="name"
        pagination={pagination}
        setPagination={setPagination}
        columns={columns}
        initialColumnOrder={[{ id: "name", desc: false }]}
        columnsBreakpoints={{ lastUpdated: "sm" }}
      />
    </div>
  );
};

export const DataTablePaginatedServerSideExample = () => {
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 2,
  });
  const [filter, setFilter] = React.useState<string>("");
  const rows = useMemo(() => {
    return data.slice(
      pagination.pageIndex * pagination.pageSize,
      (pagination.pageIndex + 1) * pagination.pageSize
    );
  }, [data, pagination]);

  return (
    <div className="s-w-full s-max-w-4xl s-overflow-x-auto">
      <Input
        name="filter"
        placeholder="Filter"
        value={filter}
        onChange={(v) => setFilter(v)}
      />
      <DataTable
        data={rows}
        totalRowCount={data.length}
        filter={filter}
        filterColumn="name"
        pagination={pagination}
        setPagination={setPagination}
        columns={columns}
        initialColumnOrder={[{ id: "name", desc: false }]}
        columnsBreakpoints={{ lastUpdated: "sm" }}
      />
    </div>
  );
};
