import type { Meta, StoryObj } from "@storybook/react";
import React, { useState, useCallback, useMemo } from 'react';

import {
  Button,
  Table
} from "../index_with_tw_base"

const meta = {
  title: "Components/Table",
  component: Table,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const TableExample = () => {
  const initialData = [
    { name: "Marketing", usedBy: 8, addedBy: "User1", lastUpdated: "2023-07-08", size: "32kb" },
    { name: "Design", usedBy: 2, addedBy: "User2", lastUpdated: "2023-07-09", size: "64kb" },
    { name: "Development", usedBy: 5, addedBy: "User3", lastUpdated: "2023-07-07", size: "128kb" },
    { name: "Sales", usedBy: 10, addedBy: "User4", lastUpdated: "2023-07-10", size: "16kb" },
    { name: "HR", usedBy: 3, addedBy: "User5", lastUpdated: "2023-07-06", size: "48kb" },
  ];

  const [data, setData] = useState(initialData);

  return (
    <div className="s-w-full s-max-w-4xl s-overflow-x-auto">
      <Table>
        <Table.Caption>Files and Folders</Table.Caption>
        <Table.Header>
          <Table.Row>
            <Table.Head column="name" sortable={true}>Name</Table.Head>
            <Table.Head column="usedBy" sortable={true}>Used by</Table.Head>
            <Table.Head column="addedBy" sortable={true}>Added by</Table.Head>
            <Table.Head column="lastUpdated" sortable={false}>Last updated</Table.Head>
            <Table.Head column="size" sortable={true}>Size</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data.map((row, index) => (
            <Table.Row key={index}>
              <Table.Cell>{row.name}</Table.Cell>
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
