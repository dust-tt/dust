import {
  ArrowDown,
  ArrowUp,
  ChevronSelectorVertical,
} from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import type { Column, RowData } from "@tanstack/react-table";
import React from "react";

type ColumnAlign = "left" | "right" | "center";
type ColumnType = "text" | "numeric" | "row-actions" | "status";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
    tooltip?: string;
    sizeRatio?: number;
    /** Header text alignment. Overrides the alignment derived from `type` for the header only. */
    headerAlign?: ColumnAlign;
    /** Column preset: `numeric` right-aligned tabular figures; `row-actions` fixed 48px, centered, never sortable; `status` no wrapping. */
    type?: ColumnType;
    /** Render this column's body cells as `<th scope="row">` for screen readers. */
    rowHeader?: boolean;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData extends RowData> {
    /** Human-readable row label used to name selection checkboxes. */
    getRowLabel?: (row: TData) => string;
  }
}

interface ColumnPresets {
  align: ColumnAlign;
  headerAlign: ColumnAlign;
  cellClassName?: string;
  headerClassName?: string;
  sortable: boolean;
}

export const ALIGN_TEXT_CLASS: Record<ColumnAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export const ALIGN_JUSTIFY_CLASS: Record<ColumnAlign, string> = {
  left: "justify-start",
  right: "justify-end",
  center: "justify-center",
};

/** Resolves alignment, sizing and sortability from a column's `meta.type`. */
export function getDataTableColumnPresets(
  column: Column<any> // eslint-disable-line @typescript-eslint/no-explicit-any
): ColumnPresets {
  const meta = column.columnDef.meta;
  const align: ColumnAlign =
    meta?.type === "numeric"
      ? "right"
      : meta?.type === "row-actions"
        ? "center"
        : "left";

  return {
    align,
    headerAlign: meta?.headerAlign ?? align,
    cellClassName:
      cn(
        meta?.type === "numeric" && "tabular-nums whitespace-nowrap",
        meta?.type === "status" && "whitespace-nowrap",
        meta?.type === "row-actions" && "w-12"
      ) || undefined,
    headerClassName:
      cn(
        meta?.type === "numeric" && "tabular-nums",
        meta?.type === "row-actions" && "w-12"
      ) || undefined,
    // A column with no header text has nowhere to show a sort control.
    sortable: meta?.type !== "row-actions" && column.columnDef.header !== "",
  };
}

export function getSortIcon(sorted: false | "asc" | "desc") {
  switch (sorted) {
    case "asc":
      return ArrowUp;
    case "desc":
      return ArrowDown;
    default:
      return ChevronSelectorVertical;
  }
}
