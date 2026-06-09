export const SUPPORTED_REGIONS = ["europe-west1", "us-central1"] as const;
export type RegionType = (typeof SUPPORTED_REGIONS)[number];

export interface RegionInfo {
  name: RegionType;
  url: string;
}

export function isRegionType(region: string): region is RegionType {
  return SUPPORTED_REGIONS.includes(region as RegionType);
}
