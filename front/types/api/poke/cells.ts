import type { CellInfo } from "@app/types/cell";

export type GetPokeCellsResponseType = {
  currentCell: CellInfo;
  cells: CellInfo[];
};
