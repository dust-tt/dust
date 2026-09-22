import {
  BasicCellContent,
  Caption,
  Cell,
  CellContent,
  CellContentWithCopy,
  NumericCellContent,
  StatusCellContent,
} from "./cells";
import { DataTableBase } from "./DataTable";
import { MoreButton } from "./menu";
import { Body, Head, Header, Root, Row } from "./parts";

export {
  DATA_TABLE_DENSITIES,
  DATA_TABLE_HEADER_HEIGHT_PX,
  DATA_TABLE_ROW_HEIGHT_PX,
  type DataTableDensity,
} from "./layout";
export { type DataTableMoreButtonProps, type MenuItem } from "./menu";
export {
  ALIGN_JUSTIFY_CLASS,
  ALIGN_TEXT_CLASS,
  getDataTableColumnPresets,
} from "./presets";
export {
  ScrollableDataTable,
  type ScrollableDataTableProps,
} from "./ScrollableDataTable";
export {
  createRadioSelectionColumn,
  createSelectionColumn,
} from "./selection";

export const DataTable = Object.assign(DataTableBase, {
  Root,
  Header,
  Head,
  Body,
  Row,
  Cell,
  CellContent,
  BasicCellContent,
  NumericCellContent,
  StatusCellContent,
  CellContentWithCopy,
  MoreButton,
  Caption,
});
