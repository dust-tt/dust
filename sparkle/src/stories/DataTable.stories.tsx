import type { Meta } from "@storybook/react";
import React from "react";

import { DataTable } from "../_index";

const meta = {
  title: "Components/DataTable",
  component: DataTable,
} satisfies Meta<typeof DataTable>;

export default meta;

export const DataTableExample = () => {
  const columns = ["Name", "Age", "Location", "Email"];
  const data = [
    ["Alice", 30, "New York", "test@test.tt"],
    ["Bob", 25, "Los Angeles", "test@test.tt"],
    ["Charlie", 35, "Chicago", "test@test.tt"],
    ["Paul", 35, "London", "test@test.tt"],
    ["Charles", 5, "Paris", "test@test.tt"],
  ];
  return <DataTable
    columns={columns}
    rows={data}
    name="Test table"
    enableCopy={true}
  />;
};
