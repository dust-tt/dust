import type { Result } from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";

import AuthService from "./authService.js";
import TokenStorage from "./tokenStorage.js";

let dustApiInstance: DustAPI | null = null;

export const getApiDomain = (region: string | null): Result<string, Error> => {
  const url = (() => {
    switch (region) {
      case "europe-west1":
        return process.env.DUST_EU_URL || process.env.DEFAULT_DUST_API_DOMAIN;
      case "us-central1":
        return process.env.DUST_US_URL || process.env.DEFAULT_DUST_API_DOMAIN;
      default:
        return process.env.DEFAULT_DUST_API_DOMAIN;
    }
  })();

  if (!url) {
    return new Err(new Error("Unable to determine API domain."));
  }

  return new Ok(url);
};

/**
 * Gets or creates a DustAPI instance with the stored authentication token and region
 * @returns A Promise resolving to a DustAPI instance or null if no token is available
 */
export const getDustClient = async (): Promise<
  Result<DustAPI | null, Error>
> => {
  if (dustApiInstance) {
    return new Ok(dustApiInstance);
  }

  // Get a valid access token (this will refresh if needed)
  const accessToken = await AuthService.getValidAccessToken();

  if (!accessToken) {
    return new Ok(null);
  }

  const region = await TokenStorage.getRegion();
  const apiDomainRes = getApiDomain(region);

  if (apiDomainRes.isErr()) {
    return new Err(apiDomainRes.error);
  }

  dustApiInstance = new DustAPI(
    {
      url: apiDomainRes.value,
    },
    {
      apiKey: async () => {
        const token = await AuthService.getValidAccessToken();
        return token || "";
      },
      workspaceId: (await TokenStorage.getWorkspaceId()) ?? "me",
      extraHeaders: {
        "X-Dust-CLI-Version": process.env.npm_package_version || "0.1.0",
        "User-Agent": "Dust CLI",
      },
    },
    console
  );

  return new Ok(dustApiInstance);
};

/**
 * Resets the cached DustAPI instance. Should be called after logout or token changes.
 */
export const resetDustClient = (): void => {
  dustApiInstance = null;
};

export default {
  getDustClient,
  resetDustClient,
};
