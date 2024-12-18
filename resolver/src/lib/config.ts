import { EnvironmentConfig } from "@dust-tt/types";

const CLUSTER_REGIONS = ["europe-west1", "us-central1"] as const;
export type ClusterRegionType = (typeof CLUSTER_REGIONS)[number];

export function isValidRegion(region: string): region is ClusterRegionType {
  return ["europe-west1", "us-central1"].includes(region as ClusterRegionType);
}

const clusterUrl = {
  "europe-west1": "https://eu.dust.tt",
  "us-central1": "https://dust.tt",
};

export const config = {
  getLookupApiSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("REGION_RESOLVER_SECRET");
  },
  getRegionUrls: (): Record<ClusterRegionType, string> => {
    return clusterUrl;
  },
  getRegionUrl: (region: ClusterRegionType) => {
    return clusterUrl[region];
  },
};
