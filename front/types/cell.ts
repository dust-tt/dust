import type { RegionType } from "@app/types/region";

// Cells are standalone deployments of a whole Dust environment.
export const SUPPORTED_CELLS = ["cell-00000", "cell-00001"] as const;
export type CellType = (typeof SUPPORTED_CELLS)[number];

export interface CellInfo {
  name: CellType;
  region: RegionType;
  url: string;
}

export function isCellType(cell: string): cell is CellType {
  return SUPPORTED_CELLS.includes(cell as CellType);
}
