import { EnvironmentConfig, isDevelopment } from "@dust-tt/types";

const CLUSTER_REGIONS = ["local", "europe-west1", "us-central1"] as const;

export type ClusterRegionType = (typeof CLUSTER_REGIONS)[number];

const REGIONS_TO_URLS: Map<ClusterRegionType, string> = new Map([
  ["local", "http://localhost:3000"],
  ["europe-west1", "https://eu.dust.tt"],
  ["us-central1", "https://dust.tt"],
]);

export const config = {
  getCurrentRegion: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_REGION");
  },
  getLookupApiSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("REGION_RESOLVER_SECRET");
  },
  getAvailableRegions: () => {
    return (
      [...REGIONS_TO_URLS]
        // Keep only the regions that match the current environment
        .filter(
          ([region]) =>
            (isDevelopment() && region.startsWith("local")) ||
            (!isDevelopment() && !region.startsWith("local"))
        )
    );
  },
};

export function isCurrentRegion(region: ClusterRegionType): boolean {
  return config.getCurrentRegion() === region;
}

export const isMultiRegions = () => config.getAvailableRegions().length > 1;
