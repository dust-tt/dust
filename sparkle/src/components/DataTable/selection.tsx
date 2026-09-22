import { Checkbox } from "@sparkle/components/Checkbox";
import {
  radioIndicatorStyles,
  radioStyles,
} from "@sparkle/components/RadioGroup";
import { cn } from "@sparkle/lib/utils";
import type { ColumnDef, Row } from "@tanstack/react-table";
import React from "react";

interface SelectionColumnOptions {
  hideSelectAll?: boolean;
}

function getSelectionLabel<TData>(
  getRowLabel: ((row: TData) => string) | undefined,
  row: Row<TData>
) {
  const label = getRowLabel?.(row.original);
  return label ? `Select ${label}` : "Select row";
}

/** Builds a checkbox column for multi-row selection, with an optional select-all header. */
export function createSelectionColumn<TData>({
  hideSelectAll = false,
}: SelectionColumnOptions = {}): ColumnDef<TData> {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) =>
      !hideSelectAll ? (
        <Checkbox
          aria-label="Select all rows"
          checked={
            table.getIsAllRowsSelected()
              ? true
              : table.getIsSomeRowsSelected()
                ? "partial"
                : false
          }
          onCheckedChange={(state) => {
            if (state === "indeterminate") {
              return;
            }
            table.toggleAllRowsSelected(state);
          }}
        />
      ) : null,
    cell: ({ row, table }) => (
      <div className="flex h-full w-full items-center">
        <Checkbox
          aria-label={getSelectionLabel(table.options.meta?.getRowLabel, row)}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(state) => {
            if (state === "indeterminate") {
              return;
            }
            row.toggleSelected(state);
          }}
        />
      </div>
    ),
    meta: {
      className: "w-10 min-w-10",
    },
  };
}

/** Builds a radio column for single-row selection. */
export function createRadioSelectionColumn<TData>(): ColumnDef<TData> {
  return {
    id: "radio-select",
    enableSorting: false,
    enableHiding: false,
    header: () => null,
    cell: ({ row, table }) => (
      <div className="flex h-full w-full items-center">
        <div
          className={cn(
            radioStyles(),
            row.getIsSelected() && "bg-muted/50",
            !row.getCanSelect() && "cursor-not-allowed opacity-50"
          )}
          aria-checked={row.getIsSelected()}
          aria-label={getSelectionLabel(table.options.meta?.getRowLabel, row)}
          role="radio"
        >
          {row.getIsSelected() && <div className={radioIndicatorStyles()} />}
        </div>
      </div>
    ),
    meta: {
      className: "w-10 min-w-10",
    },
  };
}
