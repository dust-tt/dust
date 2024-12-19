import { ClusterRegionType } from "@app/src/lib/config";

type Resource = "user";

type ExternalUser = {
  email: string;
  email_verified: boolean;
  sub: string;
};

export type UserLookupResponse = {
  user: {
    email: string;
  } | null;
};

export class RegionLookupClient {
  private readonly secret: string;
  private readonly endpoints: Record<ClusterRegionType, string>;

  constructor(secret: string, endpoints: Record<ClusterRegionType, string>) {
    this.secret = secret;
    this.endpoints = endpoints;
  }

  async lookupUser(
    user: ExternalUser,
  ): Promise<Record<ClusterRegionType, UserLookupResponse>> {
    return this.lookup("user", { user });
  }

  private async lookup<T extends object>(
    resource: Resource,
    body: object,
  ): Promise<Record<ClusterRegionType, T>> {
    const results = await Promise.all(
      Object.entries(this.endpoints).map(async ([region, url]) => {
        const response = await fetch(`${url}/api/lookup/${resource}`, {
          method: "POST",
          headers: this.getDefaultHeaders(),
          body: JSON.stringify(body),
        });

        const data = await response.json();
        if ("error" in data) {
          throw new Error(`${region} lookup failed: ${data.error.message}`);
        }

        return [region, data] as const;
      }),
    );

    return Object.fromEntries(results) as Record<ClusterRegionType, T>;
  }

  getDefaultHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.secret}`,
    };
  }
}
