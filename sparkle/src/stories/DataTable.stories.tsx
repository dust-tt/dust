import type { Meta } from "@storybook/react";
import {
  ColumnDef,
  PaginationState,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import React, { useCallback, useMemo, useState } from "react";

import {
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  Input,
  ScrollableDataTable,
} from "@sparkle/components/";
import { createSelectionColumn, MenuItem } from "@sparkle/components/DataTable";
import { FolderIcon } from "@sparkle/icons/app";

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
  menuItems?: MenuItem[];
  dropdownMenuProps?: Omit<
    React.ComponentPropsWithoutRef<typeof DropdownMenu>,
    "modal"
  >;
  id?: number;
  roundedAvatar?: boolean;
};

type TransformedData = {
  dropdownMenuProps?: { modal: boolean };
  menuItems?: MenuItem[];
} & Data;

const data: TransformedData[] = [
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
    menuItems: [
      {
        kind: "item",
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
    menuItems: [
      {
        kind: "item",
        label: "Edit (disabled)",
        onClick: () => alert("Design menu clicked"),
        disabled: true,
      },
    ],
  },
  {
    name: "Submenu",
    usedBy: 2,
    addedBy: "Another very long user name that should be truncated",
    lastUpdated: "2023-07-09",
    size: "64kb",
    icon: FolderIcon,
    menuItems: [
      {
        kind: "submenu",
        label: "Add to Space",
        items: [
          { id: "space1", name: "Space 1" },
          { id: "space2", name: "Space 2" },
          { id: "space3", name: "Space 3" },
          { id: "space4", name: "Space 4" },
        ],
        onSelect: (itemId) => console.log("Add to Space", itemId),
      },
      {
        disabled: true,
        kind: "submenu",
        label: "Add to Space (disabled)",
        items: [
          { id: "space1", name: "Space 1" },
          { id: "space2", name: "Space 2" },
          { id: "space3", name: "Space 3" },
          { id: "space4", name: "Space 4" },
        ],
        onSelect: (itemId) => console.log("Add to Space", itemId),
      },
      {
        kind: "item",
        label: "Test",
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
    menuItems: [
      {
        kind: "item",
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
    id: "name",
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
    id: "usedBy",
    meta: {
      className: "s-w-[82px] s-hidden @xs/table:s-table-cell",
    },
    header: "Used by",
    cell: (info) => (
      <DataTable.BasicCellContent label={info.row.original.usedBy} />
    ),
  },
  {
    accessorKey: "addedBy",
    header: "Added by",
    id: "addedBy",
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
    id: "lastUpdated",
    header: "Last updated",
    meta: {
      className: "s-w-[128px] s-hidden @sm/table:s-table-cell",
    },
    cell: (info) => (
      <DataTable.BasicCellContent label={info.row.original.lastUpdated} />
    ),
    enableSorting: false,
  },
  {
    accessorKey: "size",
    id: "size",
    header: "Size",
    meta: {
      className: "s-w-[48px] s-hidden @sm/table:s-table-cell",
    },
    cell: (info) => (
      <DataTable.BasicCellContent label={info.row.original.size} />
    ),
  },
  {
    id: "actions",
    header: "",
    cell: (info) => (
      <DataTable.MoreButton
        menuItems={info.row.original.menuItems}
        dropdownMenuProps={info.row.original.dropdownMenuProps}
      />
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

  const tableData = data.map(({ menuItems, ...item }) => ({
    ...item,
    menuItems: menuItems?.length
      ? [
          {
            kind: "item" as const,
            label: "Edit",
            onClick: () => {
              setSelectedName(item.name);
              setDialogOpen(true);
            },
          },
          ...menuItems,
        ]
      : undefined,
  }));

  return (
    <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6">
      <Input
        name="filter"
        placeholder="Filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="">
        <DataTable
          data={tableData}
          filter={filter}
          filterColumn="name"
          columns={columns}
        />
      </div>
      <Dialog open={dialogOpen} onOpenChange={(open) => setDialogOpen(open)}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Edit {selectedName}</DialogTitle>
            <DialogDescription>
              Make changes to your item here
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>Your dialog content here</DialogContainer>
          <DialogFooter
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
        </DialogContent>
      </Dialog>
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

export const DataTablePaginatedPageButtonsDisabledExample = () => {
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
        disablePaginationNumbers
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

export const DataTablePaginatedServerSideRowCountCappedExample = () => {
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
        rowCountIsCapped={true}
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

const createData = (start: number, count: number) => {
  return Array(count)
    .fill(0)
    .map((_, i) => ({
      id: i,
      name: `Item ${start + i + 1}`,
      usedBy: Math.floor(Math.random() * 100),
      addedBy: `UserUserUserUserUserUserUserUserUserUserUser ${Math.floor(Math.random() * 10) + 1}`,
      lastUpdated: `2023-08-${Math.floor(Math.random() * 30) + 1}`,
      size: `${Math.floor(Math.random() * 200)}kb`,
      menuItems: [
        { kind: "item", label: "test", onClick: () => console.log("hey") },
      ],
    })) as TransformedData[];
};

export const ScrollableDataTableExample = () => {
  const [filter, setFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [data, setData] = useState(() => createData(0, 50));
  const [isLoading, setIsLoading] = useState(false);

  // Load more data when user scrolls to bottom
  const loadMore = useCallback(() => {
    setIsLoading(true);

    // Simulate API call delay
    setTimeout(() => {
      setData((prevData) => [...prevData, ...createData(prevData.length, 50)]);
      setIsLoading(false);
    }, 1000);
  }, []);

  const columnsWithSize = columns.map((column, index) => {
    return { ...column, meta: { sizeRatio: index % 2 === 0 ? 15 : 10 } };
  });

  const columnsWithSelection: ColumnDef<Data>[] = useMemo(
    () => [createSelectionColumn<Data>(), ...columnsWithSize],
    []
  );
  return (
    <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6">
      <h3 className="s-text-lg s-font-medium">
        Virtualized ScrollableDataTable with Infinite Scrolling
      </h3>

      <div className="s-flex s-flex-col s-gap-4">
        <Input
          name="filter"
          placeholder="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <ScrollableDataTable
          data={data}
          filter={filter}
          filterColumn="name"
          columns={columnsWithSelection}
          onLoadMore={loadMore}
          isLoading={isLoading}
          maxHeight="s-max-h-[500px]"
          rowSelection={rowSelection}
          setRowSelection={setRowSelection}
          enableRowSelection={true}
        />

        <div className="s-text-sm s-text-muted-foreground">
          Loaded {data.length} rows. Scroll to the bottom to load more.
        </div>
      </div>
    </div>
  );
};

export const DataTableWithRowSelectionExample = () => {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [data] = useState<Data[]>(() => createData(0, 10));
  const [filter, setFilter] = useState("");

  const columnsWithSelection: ColumnDef<Data>[] = useMemo(
    () => [createSelectionColumn<Data>(), ...columns],
    []
  );

  return (
    <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6">
      <h3 className="s-text-lg s-font-medium">DataTable with Row Selection</h3>

      <div className="s-flex s-flex-col s-gap-4">
        <Input
          name="filter"
          placeholder="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <DataTable
          data={data}
          filter={filter}
          filterColumn="name"
          columns={columnsWithSelection}
          rowSelection={rowSelection}
          setRowSelection={setRowSelection}
          enableRowSelection={true}
        />

        <div className="s-rounded-md s-border s-bg-muted/50 s-p-2">
          <h4 className="s-mb-2 s-font-medium">Selection State:</h4>
          <pre className="s-overflow-auto s-text-xs">
            {JSON.stringify(rowSelection, null, 2)}
          </pre>
          <p className="s-mt-2 s-text-sm">
            Selected {Object.keys(rowSelection).length} of {data.length} rows
          </p>
        </div>
      </div>
    </div>
  );
};
