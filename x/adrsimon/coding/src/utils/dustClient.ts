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

export const getDustClient = async (): Promise<
  Result<DustAPI | null, Error>
> => {
  if (dustApiInstance) {
    return new Ok(dustApiInstance);
  }

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
        if (token.isErr()) {
          return null;
        }
        return token.value || "";
      },
      workspaceId: (await TokenStorage.getWorkspaceId()) ?? "me",
      extraHeaders: {
        "X-Dust-CLI-Version": process.env.npm_package_version || "0.1.0",
        "User-Agent": "Dust Coding CLI",
      },
    },
    console
  );

  return new Ok(dustApiInstance);
};

export const resetDustClient = (): void => {
  dustApiInstance = null;
};

export default {
  getDustClient,
  resetDustClient,
};
