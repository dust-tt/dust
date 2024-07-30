import type { Meta, StoryObj } from "@storybook/react";
import React, { useState, useCallback, useMemo } from 'react';

import {
  Button, FolderIcon,
  Table,

} from "../index_with_tw_base";
import { IconButtonPrimary } from "@sparkle/stories/IconButton.stories";

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
    { name: "Marketing", usedBy: 8, addedBy: "User1", lastUpdated: "2023-07-08", size: "32kb", avatarUrl: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg" },
    { name: "Design", usedBy: 2, addedBy: "User2", lastUpdated: "2023-07-09", size: "64kb", icon: FolderIcon },
    { name: "Development", usedBy: 5, addedBy: "User3", lastUpdated: "2023-07-07", size: "128kb" },
    { name: "Sales", usedBy: 10, addedBy: "User4", lastUpdated: "2023-07-10", size: "16kb" },
    { name: "HR", usedBy: 3, addedBy: "User5", lastUpdated: "2023-07-06", size: "48kb" },
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
        <Table.Caption>Files and Folders</Table.Caption>
        <Table.Header>
          <Table.Row>
            <Table.Head column="name" sortable={true} sorting={sorting} onSort={handleSort}>Name</Table.Head>
            <Table.Head column="usedBy" sortable={true} sorting={sorting} onSort={handleSort}>Used by</Table.Head>
            <Table.Head column="addedBy" sortable={true} sorting={sorting} onSort={handleSort}>Added by</Table.Head>
            <Table.Head column="lastUpdated" sortable={false}>Last updated</Table.Head>
            <Table.Head column="size" sortable={true} sorting={sorting} onSort={handleSort}>Size</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {sortedData.map((row, index) => (
            <Table.Row key={index}>
              <Table.Cell avatarUrl={row.avatarUrl} icon={row.icon}>
                {row.name}
              </Table.Cell>
              <Table.Cell>{row.usedBy}</Table.Cell>
              <Table.Cell>{row.addedBy}</Table.Cell>
              <Table.Cell>{row.lastUpdated}</Table.Cell>
              <Table.Cell>{row.size}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
        <Table.Footer>
          <Table.Row>
            <Table.Cell colSpan={5}>
              <div className="s-flex s-justify-end s-items-center">
                <Button variant="secondary" size="sm" label="Download" onClick={() => {alert('Download clicked')}} />
              </div>
            </Table.Cell>
          </Table.Row>
        </Table.Footer>
      </Table>
    </div>
  );
};

export const Default: Story = {
  render: () => <TableExample />,
};
