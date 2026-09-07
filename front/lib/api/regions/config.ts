import type { RegionType } from "@app/types/region";
import { isDevelopment } from "@app/types/shared/env";
import { EnvironmentConfig } from "@app/types/shared/utils/config";

export const REGION_TIMEZONES: Record<RegionType, string> = {
  "europe-west1": "Europe/Paris",
  "us-central1": "America/New_York",
};

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
