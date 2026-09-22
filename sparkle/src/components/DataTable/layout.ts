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

export const DATA_TABLE_HEADER_HEIGHT_PX = DATA_TABLE_ROW_HEIGHT_PX;

export const DENSITY_HEADER_HEIGHT_CLASS = DENSITY_ROW_HEIGHT_CLASS;

// 124px column minimum when scrolling horizontally, so columns stay readable.
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

// Lets cell helpers follow the table's density and scroll layout without call
// sites threading props through column defs.
export const DataTableLayoutContext = createContext<DataTableLayout>(
  DEFAULT_DATA_TABLE_LAYOUT
);

export function useDataTableLayout() {
  return useContext(DataTableLayoutContext);
}
