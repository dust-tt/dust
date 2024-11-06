import { DustAPI } from "@dust-tt/client";
import { useAuth } from "@extension/components/auth/AuthProvider";

export const useDustAPI = () => {
  const { token, isAuthenticated, isUserSetup, user, workspace } = useAuth();

  if (!isAuthenticated || !isUserSetup || !user || !workspace || !token) {
    throw new Error("Not authenticated");
  }

  return new DustAPI(
    {
      url: process.env.DUST_DOMAIN ?? "https://dust.tt",
      nodeEnv: process.env.NODE_ENV ?? "production",
    },
    {
      apiKey: token,
      workspaceId: workspace.sId,
    },
    console
  );
};
