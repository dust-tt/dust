import { LoadingBlock, TableSkeleton } from "@sparkle/components";
import type { TableSkeletonCellProps } from "@sparkle/components";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ColumnDef } from "@tanstack/react-table";
import React from "react";

interface MemberRow {
  member: string;
  role: string;
  usage: string;
}

const columns = [
  {
    accessorKey: "member",
    header: "Member",
    meta: { className: "w-1/2" },
  },
  {
    accessorKey: "role",
    header: "Role",
    enableSorting: false,
    meta: { className: "w-1/4" },
  },
  {
    accessorKey: "usage",
    header: "Usage",
    meta: { className: "w-1/4", headerAlign: "right" },
  },
] satisfies ColumnDef<MemberRow, string>[];

function MemberSkeletonCell({ columnId, rowIndex }: TableSkeletonCellProps) {
  switch (columnId) {
    case "member":
      return (
        <div className="flex items-center gap-2">
          <LoadingBlock className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <LoadingBlock
              className={rowIndex % 2 === 0 ? "h-3 w-2/3" : "h-3 w-1/2"}
            />
            <LoadingBlock className="h-3 w-3/4" />
          </div>
        </div>
      );
    case "role":
      return <LoadingBlock className="h-6 w-16 max-w-full rounded-full" />;
    case "usage":
      return <LoadingBlock className="ml-auto h-4 w-12 max-w-full" />;
    default:
      return null;
  }
}

const meta = {
  title: "Feedback & Status/TableSkeleton",
  component: TableSkeleton,
  args: {
    columns,
    SkeletonCell: MemberSkeletonCell,
    rowCount: 5,
    rowHeight: 48,
  },
  argTypes: {
    columns: { control: false },
    SkeletonCell: { control: false },
    rowCount: { control: { type: "number", min: 1, max: 10 } },
    rowHeight: { control: { type: "number", min: 48, max: 96 } },
  },
  render: (args) => (
    <div className="w-full max-w-2xl">
      <TableSkeleton {...args} />
    </div>
  ),
} satisfies Meta<typeof TableSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Reuse the loaded table columns and provide a cell renderer for their contents:
 * circular avatars and two text lines for members, pill-shaped roles, and
 * right-aligned usage values. Vary text widths with rowIndex for a natural layout.
 * @summary Custom cell placeholders matching avatars, badges, and text.
 */
export const CustomCells: Story = {};
