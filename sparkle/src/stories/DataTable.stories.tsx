import type { Meta, StoryObj } from "@storybook/react";
import { ColumnDef } from "@tanstack/react-table";
import React from "react";

import { DataTable, FolderIcon } from "../index_with_tw_base";

const meta = {
  title: "Components/DataTable",
  component: DataTable,
} satisfies Meta<typeof DataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

type Data = {
  name: string;
  description?: string;
  usedBy: number;
  addedBy: string;
  lastUpdated: string;
  size: string;
  avatarUrl?: string;
  icon?: React.ComponentType<{ className?: string }>;
  clickable?: boolean;
  onClick?: () => void;
  showMore?: boolean;
  onMoreClick?: () => void;
};

const DataTableExample = () => {
  const data: Data[] = [
    {
      name: "Marketing",
      description: "(23 items)",
      usedBy: 8,
      addedBy: "User1",
      lastUpdated: "July 8, 2023",
      size: "32kb",
      avatarUrl: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
      clickable: true,
      onClick: () => console.log("hehe"),
      showMore: true,
      onMoreClick: () => console.log("show more"),
    },
    {
      name: "Design",
      usedBy: 2,
      addedBy: "User2",
      lastUpdated: "2023-07-09",
      size: "64kb",
      icon: FolderIcon,
      clickable: false,
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
      cell: (info) => (
        <DataTable.Cell
          avatarUrl={info.row.original.avatarUrl}
          icon={info.row.original.icon}
          description={info.row.original.description}
        >
          {info.row.original.name}
        </DataTable.Cell>
      ),
    },
    {
      accessorKey: "usedBy",
      header: "Used by",
      cell: (info) => (
        <DataTable.Cell>{info.row.original.usedBy}</DataTable.Cell>
      ),
    },
    {
      accessorKey: "addedBy",
      header: "Added by",
      cell: (info) => (
        <DataTable.Cell>{info.row.original.addedBy}</DataTable.Cell>
      ),
    },
    {
      accessorKey: "lastUpdated",
      header: "Last updated",
      cell: (info) => (
        <DataTable.Cell>{info.row.original.lastUpdated}</DataTable.Cell>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "size",
      header: "Size",
      cell: (info) => <DataTable.Cell>{info.row.original.size}</DataTable.Cell>,
    },
  ];

  return (
    <div className="s-w-full s-max-w-4xl s-overflow-x-auto">
      <DataTable data={data} columns={columns} />
    </div>
  );
};

export const Default: Story = {
  render: () => <DataTableExample />,
};
