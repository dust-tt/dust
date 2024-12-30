import { DustAPI } from "@dust-tt/client";
import { useAuth } from "@extension/components/auth/AuthProvider";
import { getAccessToken } from "@extension/lib/auth";

export const useDustAPI = () => {
  const { token, isAuthenticated, isUserSetup, user, workspace } = useAuth();

  if (!isAuthenticated || !isUserSetup || !user || !workspace || !token) {
    throw new Error("Not authenticated");
  }

  if (!process.env.DUST_DOMAIN || !process.env.NODE_ENV) {
    throw new Error("Dust domain or node env not set");
  }

  return new DustAPI(
    {
      url: process.env.DUST_DOMAIN,
      nodeEnv: process.env.NODE_ENV,
    },
    {
      apiKey: () => getAccessToken(),
      workspaceId: workspace.sId,
    },
    console
  );
};
