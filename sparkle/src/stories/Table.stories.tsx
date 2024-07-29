import type { Meta } from "@storybook/react";
import React from 'react';

import {
  Button,
  Table} from "../index_with_tw_base"

const meta = {
  title: "Components/Table",
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;
//
export const SparkleTableExample = () => {
  const data = [
    { name: "Marketing", usedBy: 8, addedBy: "User1", lastUpdated: "July 8, 2023", size: "32kb" },
    { name: "Design", usedBy: 2, addedBy: "User2", lastUpdated: "July 8, 2023", size: "32kb" },
    // ... more rows
  ];

  return (
    <div className="s-w-full s-overflow-x-auto">
      <Table>
        <Table.Caption>Files and Folders</Table.Caption>
        <Table.Header>
          <Table.Row>
            <Table.Head column="name" sortable={true}>Name</Table.Head>
            <Table.Head column="usedBy" sortable={false}>Used by</Table.Head>
            <Table.Head column="addedBy" sortable={false}>Added by</Table.Head>
            <Table.Head column="lastUpdated">Last updated</Table.Head>
            <Table.Head column="size">Size</Table.Head>
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
                <Button variant="secondary" size="sm" label="Download" onClick={() => {/* Implement download */}} />
              </div>
            </Table.Cell>
          </Table.Row>
        </Table.Footer>
      </Table>
    </div>
  );
};
