import { isDevelopment } from "@app/types/shared/env";
import { EnvironmentConfig } from "@app/types/shared/utils/config";

export const SUPPORTED_REGIONS = ["europe-west1", "us-central1"] as const;
export type RegionType = (typeof SUPPORTED_REGIONS)[number];

export const REGION_TIMEZONES: Record<RegionType, string> = {
  "europe-west1": "Europe/Paris",
  "us-central1": "America/New_York",
};

export interface RegionInfo {
  name: RegionType;
  url: string;
}

export function isRegionType(region: string): region is RegionType {
  return SUPPORTED_REGIONS.includes(region as RegionType);
}

export const config = {
  getCurrentRegion: (): RegionType => {
    return EnvironmentConfig.getEnvVariable("REGION") as RegionType;
  },
  getLookupApiSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("REGION_RESOLVER_SECRET");
  },
  getRegionUrl(region: RegionType): string {
    if (
      isDevelopment() &&
      !EnvironmentConfig.getOptionalEnvVariable("DUST_EU_URL")
    ) {
      return "http://localhost:3000";
    }

    return region === "europe-west1"
      ? EnvironmentConfig.getEnvVariable("DUST_EU_URL")
      : EnvironmentConfig.getEnvVariable("DUST_US_URL");
  },
  getOtherRegionInfo(): RegionInfo {
    const currentRegion = this.getCurrentRegion();
    const otherRegion =
      currentRegion === "europe-west1" ? "us-central1" : "europe-west1";

    return {
      name: otherRegion,
      url: this.getRegionUrl(otherRegion),
    };
  },
  getDustRegionSyncEnabled: (): boolean => {
    return (
      EnvironmentConfig.getEnvVariable("REGION") !== "us-central1" ||
      isDevelopment()
    );
  },
  getDustRegionSyncMasterUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_US_URL");
  },
};
