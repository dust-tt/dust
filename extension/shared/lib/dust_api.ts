import { getAccessToken } from "@app/shared/lib/auth";
import { useAuth } from "@app/ui/components/auth/AuthProvider";
import { DustAPI } from "@dust-tt/client";

export const useDustAPI = () => {
  const { token, isAuthenticated, isUserSetup, user, workspace } = useAuth();

  const commitHash = process.env.COMMIT_HASH;
  const extensionVersion = process.env.VERSION;
  if (!isAuthenticated || !isUserSetup || !user || !workspace || !token) {
    throw new Error("Not authenticated");
  }

  if (!process.env.NODE_ENV) {
    throw new Error("Dust domain or node env not set");
  }

  return new DustAPI(
    {
      url: user.dustDomain,
    },
    {
      apiKey: () => getAccessToken(),
      workspaceId: workspace.sId,
      extraHeaders: {
        "X-Dust-Extension-Version": extensionVersion || "development",
        "X-Commit-Hash": commitHash || "development",
      },
    },
    console
  );
};
