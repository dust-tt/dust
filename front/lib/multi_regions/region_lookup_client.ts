import type {
  UserLookupRequestBodyType,
  UserLookupResponse,
} from "@app/pages/api/lookup/[resource]";

import { config, isCurrentRegion } from "./config";

type Resource = "user";

export class RegionLookupClient {
  private async lookup<T extends object, U>(resource: Resource, body: U) {
    const rawResults = await Promise.all(
      config.getAvailableRegions().map(async ([region, url]) => {
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
              response: data as T,
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
      Authorization: `Bearer ${config.getLookupApiSecret()}`,
    };
  }

  async lookupUser(user: UserLookupRequestBodyType["user"]) {
    return this.lookup<UserLookupResponse, UserLookupRequestBodyType>("user", {
      user,
    });
  }
}
