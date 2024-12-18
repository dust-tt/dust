import { EnvironmentConfig } from "@dust-tt/types";

const CLUSTER_REGIONS = ["europe-west1", "us-central1"] as const;
export type ClusterRegionType = (typeof CLUSTER_REGIONS)[number];

const config = {
  getLookupApiSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("REGION_RESOLVER_SECRET");
  },
  getRegionUrls: (): Record<ClusterRegionType, string> => {
    return {
      "europe-west1": "https://eu.dust.tt",
      "us-central1": "https://us.dust.tt",
    };
  },
};
