import React, { createContext, useContext } from "react";
export const DATA_TABLE_DENSITIES = ["compact", "default", "relaxed"] as const;
export type DataTableDensity = (typeof DATA_TABLE_DENSITIES)[number];

/** Row height per density, in px. `default` is the historical 48px row. */
export const DATA_TABLE_ROW_HEIGHT_PX: Record<DataTableDensity, number> = {
  compact: 40,
  default: 48,
  relaxed: 64,
};

export const DENSITY_ROW_HEIGHT_CLASS: Record<DataTableDensity, string> = {
  compact: "h-10",
  default: "h-12",
  relaxed: "h-16",
};

// Header rows are as tall as body rows.
export const DATA_TABLE_HEADER_HEIGHT_PX = DATA_TABLE_ROW_HEIGHT_PX;

export const DENSITY_HEADER_HEIGHT_CLASS = DENSITY_ROW_HEIGHT_CLASS;

// Column minimum (124px) when the table scrolls horizontally, so columns do
// not collapse to unreadable widths.
export const SCROLL_COLUMN_MIN_WIDTH_CLASS = "min-w-31";

export interface DataTableLayout {
  density: DataTableDensity;
  /** True when the table scrolls horizontally and columns need a minimum width. */
  enforceColumnMinWidth: boolean;
}

export const DEFAULT_DATA_TABLE_LAYOUT: DataTableLayout = {
  density: "default",
  enforceColumnMinWidth: false,
};

// Lets the cell helpers (Cell, BasicCellContent, CellContent) follow the table's
// density and scroll layout without every call site threading props through
// its column defs.
export const DataTableLayoutContext = createContext<DataTableLayout>(
  DEFAULT_DATA_TABLE_LAYOUT
);

export function useDataTableLayout() {
  return useContext(DataTableLayoutContext);
}
