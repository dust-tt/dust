import type { Meta } from "@storybook/react";
import React from "react";

import { DataTable } from "@sparkle/components";



const meta = {
  title: "Components/StickyDataTable",
  component: DataTable,
} satisfies Meta<typeof DataTable>;

export default meta;

type Data = {
  name: string;
  version: string;
  feedback: string;
  usage: string;
  lastUpdated: string;
  addedBy: string;
};

const data: Data[] = [
  {
    name: "Assistant 1",
    version: "1.0",
    feedback: "10",
    usage: "100",
    lastUpdated: "2024-01-01",
    addedBy: "User 1"
  },
  {
    name: "Assistant 2",
    version: "2.0",
    feedback: "20",
    usage: "200",
    lastUpdated: "2024-01-02",
    addedBy: "User 2"
  },
  // Add more data as needed
];

const columns = [
  {
    accessorKey: "name",
    header: "Name",
    cell: (info) => (
      <div className="s-sticky s-left-0 s-bg-white s-z-10">
        {info.getValue()}
      </div>
    ),
    meta: {
      className: "s-sticky s-left-0 s-bg-white s-z-10"
    }
  },
  {
    accessorKey: "version",
    header: "Version",
  },
  {
    accessorKey: "feedback",
    header: "Feedback",
  },
  {
    accessorKey: "usage",
    header: "Usage",
  },
  {
    accessorKey: "lastUpdated",
    header: "Last Updated",
  },
  {
    accessorKey: "addedBy",
    header: "Added By",
  }
];

export const StickyDataTableExample = () => {
  return (
    <div className="s-relative s-w-full s-overflow-x-auto s-border s-border-structure-200">
      <DataTable
        data={data}
        columns={columns}
        className="s-w-full s-min-w-[800px]" // Set minimum width to force scrolling
      />
    </div>
  );
};
