import { EnvironmentConfig, isDevelopment } from "@dust-tt/types";

import type {
  UserLookupRequestBodyType,
  UserLookupResponse,
} from "@app/pages/api/lookup/[resource]";

const CLUSTER_REGIONS = ["local", "europe-west1", "us-central1"] as const;
type ClusterRegionType = (typeof CLUSTER_REGIONS)[number];

const REGIONS_TO_URLS: Map<ClusterRegionType, string> = new Map([
  ["local", "http://localhost:3000"],
  ["europe-west1", "https://eu.dust.tt"],
  ["us-central1", "https://dust.tt"],
]);

type Resource = "user";

function isCurrentRegion(region: ClusterRegionType): boolean {
  return EnvironmentConfig.getEnvVariable("DUST_REGION") === region;
}

const getAvailableRegions = () => {
  return (
    [...REGIONS_TO_URLS]
      // Keep only the regions that match the current environment
      .filter(
        ([region]) =>
          (isDevelopment() && region.startsWith("local")) ||
          (!isDevelopment() && !region.startsWith("local"))
      )
  );
};

export const isMultiRegions = () => getAvailableRegions().length > 1;

export class RegionLookupClient {
  private async lookup<T extends object, U>(resource: Resource, body: U) {
    const rawResults = await Promise.all(
      getAvailableRegions().map(async ([region, url]) => {
        const response = await fetch(`${url}/api/lookup/${resource}`, {
          method: "POST",
          headers: this.getDefaultHeaders(),
          body: JSON.stringify(body),
        });

        const data = await response.json();
        if ("error" in data) {
          throw new Error(`${region} lookup failed: ${data.error.message}`);
        } else {
          return [
            region,
            {
              reponse: data as T,
              isCurrentRegion: isCurrentRegion(region),
              regionUrl: url,
            },
          ] as const;
        }
      })
    );

    return new Map(rawResults);
  }

  private getDefaultHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${EnvironmentConfig.getEnvVariable("REGION_RESOLVER_SECRET")}`,
    };
  }

  async lookupUser(user: UserLookupRequestBodyType["user"]) {
    return this.lookup<UserLookupResponse, UserLookupRequestBodyType>("user", {
      user,
    });
  }
}
