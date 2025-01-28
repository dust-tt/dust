import { EnvironmentConfig, isDevelopment } from "@dust-tt/types";

export const SUPPORTED_REGIONS = ["europe-west1", "us-central1"] as const;
export type RegionType = (typeof SUPPORTED_REGIONS)[number];

interface RegionInfo {
  name: RegionType;
  url: string;
}

export const config = {
  getCurrentRegion: (): RegionType => {
    return EnvironmentConfig.getEnvVariable("DUST_REGION") as RegionType;
  },
  getLookupApiSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("REGION_RESOLVER_SECRET");
  },
  getRegionUrl(region: RegionType): string {
    if (isDevelopment()) {
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
};
