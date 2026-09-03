import type { CellInfo } from "@app/types/cell";
import type { RegionType } from "@app/types/region";

export type GetRegionResponseType = {
  region: RegionType;
  regionUrls: Record<RegionType, string>;
  currentCell: CellInfo;
  cells: CellInfo[];
};
