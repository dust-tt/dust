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
  avatarTooltipLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  moreMenuItems?: DropdownItemProps[];
  roundedAvatar?: boolean;
};

const data: Data[] = [
  {
    name: "Soupinou with tooltip on avatar",
    usedBy: 100,
    addedBy: "User1",
    lastUpdated: "July 8, 2023",
    size: "32kb",
    avatarUrl: "https://avatars.githubusercontent.com/u/138893015?s=200&v=4",
    avatarTooltipLabel: "Meow",
    roundedAvatar: true,
    onClick: () => console.log("hehe"),
  },
  {
    name: "Marketing",
    description: "(23 items)",
    usedBy: 8,
    addedBy: "User1",
    lastUpdated: "July 8, 2023",
    size: "32kb",
    avatarUrl: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
    roundedAvatar: true,
    onClick: () => alert("Marketing clicked"),
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
        label: "Edit (disabled)",
        onClick: () => alert("Design menu clicked"),
        disabled: true,
      },
    ],
    onClick: () => alert("Design clicked"),
  },
  {
    name: "Very long name that should be truncated at some point to avoid overflow and make the table more readable",
    usedBy: 2,
    addedBy: "Another very long user name that should be truncated",
    lastUpdated: "2023-07-09",
    size: "64kb",
    icon: FolderIcon,
    moreMenuItems: [
      {
        label: "Edit (disabled)",
        onClick: () => alert("Design menu clicked"),
        disabled: true,
      },
    ],
    onClick: () => alert("Design clicked"),
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
        onClick: () => alert("Design menu clicked"),
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
    meta: {
      grow: true,
    },
    cell: (info) => (
      <DataTable.CellContent
        avatarUrl={info.row.original.avatarUrl}
        avatarTooltipLabel={info.row.original.avatarTooltipLabel}
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
    minSize: 100,
    size: 100,
    header: "Used by",
    cell: (info) => (
      <DataTable.CellContent>{info.row.original.usedBy}</DataTable.CellContent>
    ),
  },
  {
    accessorKey: "addedBy",
    header: "Added by",
    size: 100,
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
    size: 100,
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
        widthClassName="s-w-full s-max-w-4xl"
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
        className="s-w-full s-max-w-4xl s-overflow-x-auto"
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
        className="s-w-full s-max-w-4xl s-overflow-x-auto"
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
