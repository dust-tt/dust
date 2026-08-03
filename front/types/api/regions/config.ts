import type { RegionType } from "@app/types/region";

export type GetRegionResponseType = {
  region: RegionType;
  regionUrls: Record<RegionType, string>;
};
