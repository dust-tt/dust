import type { Meta } from "@storybook/react";
import React from "react";

import { Table, type TableData } from "../components/StickyDataTable";

const meta = {
  title: "Components/Table",
  component: Table,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Table>;

export default meta;

const data: TableData[] = [
  {
    name: "@TableRow",
    message: 120,
    feedback: 9,
    version: "23 Aug at 07:03",
  },
  {
    name: "@Assistant",
    message: 85,
    feedback: 12,
    version: "23 Sep at 15:30",
  },
  {
    name: "@Helper",
    message: 92,
    feedback: 7,
    version: "23 Oct at 09:45",
  },
  {
    name: "@Bot",
    message: 150,
    feedback: 15,
    version: "23 Nov at 14:20",
  },
  {
    name: "@Agent",
    message: 78,
    feedback: 5,
    version: "23 Dec at 11:15",
  },
];

export const Basic = () => (
  <div className="s-w-[900px]"> {/* Increased from 1000px */}
    <Table data={data} />
  </div>
);

export const MobileView = () => (
  <div className="s-w-[375px]">
    <Table data={data} />
  </div>
);
