import {
  Avatar,
  AvatarCellSkeleton,
  Chip,
  ChipCellSkeleton,
  DataTable,
  DataTableSkeleton,
  TextCellSkeleton,
} from "@sparkle/components";
import type { DataTableSkeletonCellProps } from "@sparkle/components";
import { assertNever } from "@sparkle/lib/utils";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ColumnDef } from "@tanstack/react-table";
import React from "react";
import { expect, within } from "storybook/test";

interface MemberRow {
  member: string;
  email: string;
  role: string;
  usage: string;
  onClick?: () => void;
}

const members: MemberRow[] = [
  {
    member: "Maya Chen",
    email: "maya@example.com",
    role: "Admin",
    usage: "124",
  },
  {
    member: "Alex Rivera",
    email: "alex@example.com",
    role: "Builder",
    usage: "82",
  },
  { member: "Sam Lee", email: "sam@example.com", role: "User", usage: "16" },
];

const columns = [
  {
    id: "member" as const,
    accessorKey: "member",
    header: "Member",
    meta: { className: "w-1/2" },
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Avatar name={row.original.member} size="xs" isRounded />
        <div className="min-w-0">
          <div className="truncate text-sm">{row.original.member}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.email}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "role" as const,
    accessorKey: "role",
    header: "Role",
    enableSorting: false,
    meta: { className: "w-1/4" },
    cell: ({ row }) => (
      <Chip
        label={row.original.role}
        size="xs"
        className="w-16 justify-center"
      />
    ),
  },
  {
    id: "usage" as const,
    accessorKey: "usage",
    header: "Usage",
    meta: { className: "w-1/4", headerAlign: "right" },
    cell: ({ row }) => (
      <div className="text-right text-sm">{row.original.usage}</div>
    ),
  },
] satisfies ColumnDef<MemberRow, string>[];

type MemberColumnId = (typeof columns)[number]["id"];

function MemberSkeletonCell({
  columnId,
  rowIndex,
}: DataTableSkeletonCellProps<MemberColumnId>) {
  switch (columnId) {
    case "member":
      return (
        <AvatarCellSkeleton className="h-9">
          <TextCellSkeleton
            className={rowIndex % 2 === 0 ? "w-2/3" : "w-1/2"}
          />
          <TextCellSkeleton className="w-3/4" />
        </AvatarCellSkeleton>
      );
    case "role":
      return <ChipCellSkeleton />;
    case "usage":
      return <TextCellSkeleton className="ml-auto w-12" />;
    default:
      return assertNever(columnId);
  }
}

const meta: Meta<typeof DataTableSkeleton<MemberRow, string, MemberColumnId>> =
  {
    title: "Feedback & Status/DataTableSkeleton",
    component: DataTableSkeleton,
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
        <DataTableSkeleton {...args} />
      </div>
    ),
  };

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Reuse the loaded table columns and provide a cell renderer for their contents:
 * circular avatars and two text lines for members, chip-shaped roles, and
 * right-aligned usage values. Vary text widths with rowIndex for a natural layout.
 * Derive the column-id union from the columns and use assertNever so adding a
 * column requires updating its skeleton.
 * @summary Custom cell placeholders matching avatars, badges, and text.
 */
export const CustomCells: Story = {};

/**
 * Keep the columns and their SkeletonCell renderer together. Choose the primitives
 * from the loaded cell contents and reuse the columns in both states.
 * @summary Compare loaded rows with the corresponding custom skeletons.
 */
export const LoadedComparison: Story = {
  args: { rowCount: members.length },
  render: (args) => (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <section aria-label="Loading members">
        <h2 className="mb-2 text-sm font-semibold">Loading</h2>
        <DataTableSkeleton {...args} />
      </section>
      <section aria-label="Loaded members">
        <h2 className="mb-2 text-sm font-semibold">Loaded</h2>
        <DataTable data={members} columns={args.columns} />
      </section>
    </div>
  ),
  play: ({ canvas }) => {
    const loading = within(
      canvas.getByRole("region", { name: "Loading members" })
    );
    const loaded = within(
      canvas.getByRole("region", { name: "Loaded members" })
    );
    const loadingHeaders = loading.getAllByRole("columnheader");
    const loadedHeaders = loaded.getAllByRole("columnheader");
    expect(loadingHeaders).toHaveLength(loadedHeaders.length);
    for (const [index, header] of loadingHeaders.entries()) {
      expect(header.getBoundingClientRect().width).toBeCloseTo(
        loadedHeaders[index].getBoundingClientRect().width,
        0
      );
    }
    const loadingRow = loading.getAllByRole("row", { hidden: true })[1];
    const loadedRow = loaded.getAllByRole("row")[1];
    expect(loadingRow.getBoundingClientRect().height).toBe(
      loadedRow.getBoundingClientRect().height
    );
  },
};
