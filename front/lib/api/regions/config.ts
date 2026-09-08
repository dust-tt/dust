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
