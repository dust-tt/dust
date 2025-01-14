import type { Meta } from "@storybook/react";
import {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import React, { useMemo } from "react";

import {
  DataTable,
  DropdownMenu,
  DropdownMenuItemProps,
  Input,
  NewDialog,
  NewDialogContainer,
  NewDialogContent,
  NewDialogDescription,
  NewDialogFooter,
  NewDialogHeader,
  NewDialogTitle,
} from "@sparkle/components/";
import { FolderIcon } from "@sparkle/icons";

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
  moreMenuItems?: DropdownMenuItemProps[];
  dropdownMenuProps?: React.ComponentPropsWithoutRef<typeof DropdownMenu>;
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
    onClick: () => alert("Soupinou clicked"),
    moreMenuItems: [
      {
        label: "Edit (disabled)",
        onClick: () => alert("Soupinou clicked"),
        disabled: true,
      },
    ],
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
      className: "s-w-full",
      tooltip: "User's full name",
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
    meta: {
      className: "s-w-[82px]",
    },
    header: "Used by",
    cell: (info) => (
      <DataTable.BasicCellContent label={info.row.original.usedBy} />
    ),
  },
  {
    accessorKey: "addedBy",
    header: "Added by",
    meta: {
      className: "s-w-[128px]",
    },
    cell: (info) => (
      <DataTable.BasicCellContent
        label={info.row.original.addedBy}
        textToCopy={info.row.original.addedBy}
        tooltip={info.row.original.addedBy}
      />
    ),
  },
  {
    accessorKey: "lastUpdated",
    header: "Last updated",
    meta: {
      className: "s-w-[128px]",
    },
    cell: (info) => (
      <DataTable.BasicCellContent label={info.row.original.lastUpdated} />
    ),
    enableSorting: false,
  },
  {
    accessorKey: "size",
    header: "Size",
    meta: {
      className: "s-w-[48px]",
    },
    cell: (info) => (
      <DataTable.BasicCellContent label={info.row.original.size} />
    ),
  },
  {
    id: "actions",
    header: "",
    cell: (info) => (
      <DataTable.MoreButton moreMenuItems={info.row.original.moreMenuItems} />
    ),
    meta: {
      className: "s-w-12 s-cursor-pointer s-text-foreground",
    },
  },
];

// TODO: Fix 'Edit' changing the order of the rows
export const DataTableExample = () => {
  const [filter, setFilter] = React.useState<string>("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [selectedName, setSelectedName] = React.useState("");

  const tableData = data.map((item) =>
    item.moreMenuItems
      ? {
          ...item,
          dropdownMenuProps: {
            modal: false,
          },
          moreMenuItems: [
            {
              label: "Edit",
              onClick: () => {
                setSelectedName(item.name);
                setDialogOpen(true);
              },
            },
          ],
        }
      : item
  );

  return (
    <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6">
      <Input
        name="filter"
        placeholder="Filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <DataTable
        data={tableData}
        filter={filter}
        filterColumn="name"
        columns={columns}
      />
      <NewDialog open={dialogOpen} onOpenChange={(open) => setDialogOpen(open)}>
        <NewDialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <NewDialogHeader>
            <NewDialogTitle>Edit {selectedName}</NewDialogTitle>
            <NewDialogDescription>
              Make changes to your item here
            </NewDialogDescription>
          </NewDialogHeader>
          <NewDialogContainer>Your dialog content here</NewDialogContainer>
          <NewDialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Save",
              variant: "primary",
              onClick: () => setDialogOpen(false),
            }}
          />
        </NewDialogContent>
      </NewDialog>
    </div>
  );
};

export const DataTableClientSideSortingExample = () => {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "name", desc: true },
  ]);
  const [filter, setFilter] = React.useState<string>("");

  return (
    <div className="s-w-full s-max-w-4xl s-overflow-x-auto">
      <Input
        name="filter"
        placeholder="Filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <DataTable
        className="s-w-full s-max-w-4xl s-overflow-x-auto"
        data={data}
        filter={filter}
        filterColumn="name"
        columns={columns}
        columnsBreakpoints={{ lastUpdated: "sm" }}
        sorting={sorting}
        setSorting={setSorting}
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
        onChange={(e) => setFilter(e.target.value)}
      />
      <DataTable
        className="s-w-full s-max-w-4xl s-overflow-x-auto"
        data={data}
        filter={filter}
        filterColumn="name"
        pagination={pagination}
        setPagination={setPagination}
        columns={columns}
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
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "name", desc: true },
  ]);
  const [filter, setFilter] = React.useState<string>("");
  const rows = useMemo(() => {
    if (sorting.length > 0) {
      const order = sorting[0].desc ? -1 : 1;
      return data
        .sort((a: Data, b: Data) => {
          return (
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * order
          );
        })
        .slice(
          pagination.pageIndex * pagination.pageSize,
          (pagination.pageIndex + 1) * pagination.pageSize
        );
    }
    return data.slice(
      pagination.pageIndex * pagination.pageSize,
      (pagination.pageIndex + 1) * pagination.pageSize
    );
  }, [data, pagination, sorting]);
  return (
    <div className="s-w-full s-max-w-4xl s-overflow-x-auto">
      <Input
        name="filter"
        placeholder="Filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
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
        sorting={sorting}
        setSorting={setSorting}
        columnsBreakpoints={{ lastUpdated: "sm" }}
        isServerSideSorting={true}
      />
    </div>
  );
};
