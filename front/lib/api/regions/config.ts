import { EnvironmentConfig, isDevelopment } from "@app/types";

export const SUPPORTED_REGIONS = ["europe-west1", "us-central1"] as const;
export type RegionType = (typeof SUPPORTED_REGIONS)[number];

export interface RegionInfo {
  name: RegionType;
  url: string;
}

function isRegionType(region: string): region is RegionType {
  return SUPPORTED_REGIONS.includes(region as RegionType);
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
  getDustRegionSyncEnabled: (): boolean => {
    return (
      EnvironmentConfig.getEnvVariable("DUST_REGION") !== "us-central1" ||
      isDevelopment()
    );
  },
  getDustRegionSyncMasterUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_US_URL");
  },
  getDustAppsSyncMasterWorkspaceId: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "DUST_APPS_SYNC_MASTER_WORKSPACE_ID"
    );
  },
  getDustAppsSyncMasterSpaceId: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_APPS_SYNC_MASTER_SPACE_ID");
  },
  getDustAppsSyncMasterApiKey: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_APPS_SYNC_MASTER_API_KEY");
  },
};
