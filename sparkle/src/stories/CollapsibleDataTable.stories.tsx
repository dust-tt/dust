import type { Meta } from "@storybook/react";
import React from "react";

import { StickyDataTable } from "../components/CollapsibleDataTable";

const meta = {
  title: "Components/CollapsibleDataTable",
  component: StickyDataTable,
} satisfies Meta<typeof StickyDataTable>;

export default meta;

// Define the data type
type Data = {
  name: string;
  version: string;
  feedback: string;
  usage: string;
};

// Sample data
const data: Data[] = [
  {
    name: "Assistant 1",
    version: "1.0",
    feedback: "10",
    usage: "100"
  },
  {
    name: "Assistant 2",
    version: "2.0",
    feedback: "20",
    usage: "200"
  },
  {
    name: "Assistant 3",
    version: "1.5",
    feedback: "15",
    usage: "150"
  }
];

// Column definitions
const columns = [
  {
    accessorKey: "name",
    header: "Name",
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
  }
];

const mobileColumns = ["name", "version"];

export const CollapsibleDataTableExample = () => {
  return (
    <CollapsibleDataTable<Data>
      data={data}
      columns={columns}
      mobileColumns={mobileColumns}
      expandedContent={(row) => (
        <div className="s-space-y-2">
          <div>Feedback: {row.feedback}</div>
          <div>Usage: {row.usage}</div>
        </div>
      )}
    />
  );
};
