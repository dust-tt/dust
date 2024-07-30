import type { Meta, StoryObj } from "@storybook/react";
import React, { useCallback, useMemo,useState } from 'react';

import {
  FolderIcon,
  Table,
} from "../index_with_tw_base";

const meta = {
  title: "Components/Table",
  component: Table
} satisfies Meta<typeof Table>;


type SortingState = {
  column: DataKeys | null;
  direction: "asc" | "desc";
};

type Data = {
  name: string;
  usedBy: number;
  addedBy: string;
  lastUpdated: string;
  size: string;
};

type DataKeys = keyof Data;

export default meta;
type Story = StoryObj<typeof meta>;

const TableExample = () => {
  const initialData = [
    {
      name: "Marketing",
      description: "(23 items)",
      usedBy: 8,
      addedBy: "User1",
      lastUpdated: "July 8, 2023",
      size: "32kb",
      avatarUrl: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
      clickable: true
    },
    { name: "Design", usedBy: 2, addedBy: "User2", lastUpdated: "2023-07-09", size: "64kb", icon: FolderIcon, clickable: true },
    { name: "Development", usedBy: 5, addedBy: "User3", lastUpdated: "2023-07-07", size: "128kb", clickable: false },
    { name: "Sales", usedBy: 10, addedBy: "User4", lastUpdated: "2023-07-10", size: "16kb", clickable: true },
    { name: "HR", usedBy: 3, addedBy: "User5", lastUpdated: "2023-07-06", size: "48kb", clickable: false },
  ];

  const [sorting, setSorting] = useState<SortingState>({ column: null, direction: 'asc' });

  const sortedData = useMemo(() => {
    if (!sorting.column) {
      return initialData;
    }

    return [...initialData].sort((a, b) => {
      if (!sorting.column) {
        return -1;
      }
      const aValue = a[sorting.column];
      const bValue = b[sorting.column];

      if (aValue < bValue) {
        return sorting.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sorting.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [initialData, sorting]);


  const handleSort = useCallback((column: DataKeys | null) => {
    setSorting(prev => ({
      column: column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  return (
    <div className="s-w-full s-max-w-4xl s-overflow-x-auto">
      <Table>
        <Table.Caption className="s-text-element-800">Files and Folders</Table.Caption>
        <Table.Header>
          <Table.Row>
            <Table.Head column="name" sortable={true} sorting={sorting} onSort={handleSort} width="expanded">Name</Table.Head>
            <Table.Head column="usedBy" sortable={true} sorting={sorting} onSort={handleSort}>Used by</Table.Head>
            <Table.Head column="addedBy" sortable={true} sorting={sorting} onSort={handleSort}>Added by</Table.Head>
            <Table.Head column="lastUpdated" sortable={false}>Last updated</Table.Head>
            <Table.Head column="size" sortable={true} sorting={sorting} onSort={handleSort}>Size</Table.Head>
            <Table.Head></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {sortedData.map((row, index) => (
            <Table.Row
              key={index}
              clickable={row.clickable}
              onClick={() => row.clickable && alert(`Clicked on ${row.name}`)}
            >
              <Table.Cell avatarUrl={row.avatarUrl} icon={row.icon}  description={row.description}>
              {row.name}
              </Table.Cell>
              <Table.Cell>{row.usedBy}</Table.Cell>
              <Table.Cell>{row.addedBy}</Table.Cell>
              <Table.Cell>{row.lastUpdated}</Table.Cell>
              <Table.Cell>{row.size}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
};

export const Default: Story = {
  render: () => <TableExample />,
};
