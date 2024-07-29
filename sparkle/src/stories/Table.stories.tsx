import type { Meta } from "@storybook/react";
import React, { useState, useCallback } from 'react';

import {
  Button,
  Table
} from "../index_with_tw_base"

const meta = {
  title: "Components/Table",
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;

export const SparkleTableExample = () => {
  const [data, setData] = useState([
    { name: "Marketing", usedBy: 8, addedBy: "User1", lastUpdated: "July 8, 2023", size: "32kb" },
    { name: "Design", usedBy: 2, addedBy: "User2", lastUpdated: "July 8, 2023", size: "32kb" },
    // ... more rows
  ]);

  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleSort = useCallback((column: string) => {
    setSortColumn(prevColumn => {
      if (prevColumn === column) {
        setSortDirection(prev => prev === "asc" ? "desc" : "asc");
      } else {
        setSortDirection("asc");
      }
      return column;
    });

    setData(prevData => {
      return [...prevData].sort((a, b) => {
        if (a[column] < b[column]) return sortDirection === "asc" ? -1 : 1;
        if (a[column] > b[column]) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    });
  }, [sortDirection]);

  return (
    <div className="s-w-full s-overflow-x-auto">
      <Table>
        <Table.Caption>Files and Folders</Table.Caption>
        <Table.Header
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          registerSortableColumn={() => {}}
        >
          <Table.Row>
            <Table.Head column="name" sortable={true}>Name</Table.Head>
            <Table.Head column="usedBy" sortable={false}>Used by</Table.Head>
            <Table.Head column="addedBy" sortable={false}>Added by</Table.Head>
            <Table.Head column="lastUpdated" sortable={true}>Last updated</Table.Head>
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
                <Button variant="secondary" size="sm" label="Download" onClick={() => {/* Implement download */}} />
              </div>
            </Table.Cell>
          </Table.Row>
        </Table.Footer>
      </Table>
    </div>
  );
};
