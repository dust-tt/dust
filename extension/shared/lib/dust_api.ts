import { usePlatform } from "@app/shared/context/PlatformContext";
import { useAuth } from "@app/ui/components/auth/AuthProvider";
import { DustAPI } from "@dust-tt/client";
import { useMemo } from "react";

interface UseDustAPIOptions {
  disabled?: boolean;
}

// Overload signatures for type safety
export function useDustAPI(options?: UseDustAPIOptions): DustAPI | null;
export function useDustAPI(options: { disabled: false }): DustAPI;
export function useDustAPI(options?: UseDustAPIOptions): DustAPI | null {
  const platform = usePlatform();
  const { isAuthenticated, isUserSetup, user, workspace } = useAuth();

  const commitHash = process.env.COMMIT_HASH;
  const extensionVersion = process.env.VERSION;

  const disabled = options?.disabled ?? false;
  const canCreateAPI =
    !disabled && isAuthenticated && isUserSetup && user && workspace;

  return useMemo(() => {
    if (!canCreateAPI || !user || !workspace) {
      return null;
    }

    return new DustAPI(
      {
        url: user.dustDomain,
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
  }, [canCreateAPI, user, workspace, platform, extensionVersion, commitHash]);
}
