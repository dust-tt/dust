import { useLingui } from "@lingui/react/macro";
import { Checkbox } from "@sparkle/components/Checkbox";
import {
  radioIndicatorStyles,
  radioStyles,
} from "@sparkle/components/RadioGroup";
import { cn } from "@sparkle/lib/utils";
import type { ColumnDef, Row, Table } from "@tanstack/react-table";
import React from "react";

interface SelectionColumnOptions {
  hideSelectAll?: boolean;
}

function useSelectionLabel<TData>(table: Table<TData>, row: Row<TData>) {
  const { t } = useLingui();
  const label = table.options.meta?.getRowLabel?.(row.original);
  return label ? t`Select ${label}` : t`Select row`;
}

function SelectAllCheckbox<TData>({ table }: { table: Table<TData> }) {
  const { t } = useLingui();
  return (
    <Checkbox
      aria-label={t`Select all rows`}
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
  );
}

function SelectRowCheckbox<TData>({
  table,
  row,
}: {
  table: Table<TData>;
  row: Row<TData>;
}) {
  const selectionLabel = useSelectionLabel(table, row);
  return (
    <div className="flex h-full w-full items-center">
      <Checkbox
        aria-label={selectionLabel}
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
  );
}

function SelectRowRadio<TData>({
  table,
  row,
}: {
  table: Table<TData>;
  row: Row<TData>;
}) {
  const selectionLabel = useSelectionLabel(table, row);
  return (
    <div className="flex h-full w-full items-center">
      <div
        className={cn(
          radioStyles(),
          row.getIsSelected() && "bg-muted/50",
          !row.getCanSelect() && "cursor-not-allowed opacity-50"
        )}
        aria-checked={row.getIsSelected()}
        aria-label={selectionLabel}
        role="radio"
      >
        {row.getIsSelected() && <div className={radioIndicatorStyles()} />}
      </div>
    </div>
  );
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
      !hideSelectAll ? <SelectAllCheckbox table={table} /> : null,
    cell: ({ row, table }) => <SelectRowCheckbox table={table} row={row} />,
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
    cell: ({ row, table }) => <SelectRowRadio table={table} row={row} />,
    meta: {
      className: "w-10 min-w-10",
    },
  };
}
