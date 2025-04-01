import { DustAPI } from "@dust-tt/client";
import AuthService from "./authService.js";
import TokenStorage from "./tokenStorage.js";

let dustApiInstance: DustAPI | null = null;

/**
 * Gets or creates a DustAPI instance with the stored authentication token
 * @returns A Promise resolving to a DustAPI instance or null if no token is available
 */
export const getDustClient = async (): Promise<DustAPI | null> => {
  if (dustApiInstance) {
    return dustApiInstance;
  }

  // Get a valid access token (this will refresh if needed)
  const accessToken = await AuthService.getValidAccessToken();

  if (!accessToken) {
    return null;
  }

  const apiDomain = process.env.DEFAULT_DUST_API_DOMAIN || "https://dust.tt";

  dustApiInstance = new DustAPI(
    {
      url: apiDomain,
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

  return dustApiInstance;
};

/**
 * Reset the DustAPI client instance
 * Call this when authentication changes or when you need a fresh client
 */
export const resetDustClient = (): void => {
  dustApiInstance = null;
};

export default {
  getDustClient,
  resetDustClient,
};
