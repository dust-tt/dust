import { useRegionContext } from "@app/lib/auth/RegionContext";
import { DustAPI } from "@dust-tt/client";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import { useExtensionAuth } from "@extension/ui/components/auth/AuthProvider";
import { useMemo } from "react";

export const useDustAPI = () => {
  const platform = usePlatform();
  const { token, isAuthenticated, isUserSetup, workspace } = useExtensionAuth();
  const { regionInfo } = useRegionContext();

  const commitHash = process.env.COMMIT_HASH;
  const extensionVersion = process.env.VERSION;
  if (
    !isAuthenticated ||
    !isUserSetup ||
    !regionInfo?.url ||
    !workspace ||
    !token
  ) {
    throw new Error("Not authenticated");
  }

  if (!process.env.NODE_ENV) {
    throw new Error("Dust domain or node env not set");
  }

  return useMemo(() => {
    return new DustAPI(
      {
        url: regionInfo.url,
      },
      {
        apiKey: () => platform.auth.getAccessToken(),
        workspaceId: workspace.sId,
        extraHeaders: {
          "X-Dust-Extension-Version": extensionVersion || "development",
          "X-Commit-Hash": commitHash || "development",
        },
      },
      console
    );
  }, [regionInfo.url, workspace.sId, platform]);
};
