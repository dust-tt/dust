import { getRegionChipColor, getRegionDisplay } from "@app/lib/poke/regions";
import type { CellType } from "@app/types/cell";
import type { RegionType } from "@app/types/region";

export function getCellDisplay({
  name,
  region,
}: {
  name: CellType;
  region: RegionType;
}): string {
  return `${name} · ${getRegionDisplay(region)}`;
}

export function getCellChipColor(region: RegionType): "highlight" | "success" {
  return getRegionChipColor(region);
}
