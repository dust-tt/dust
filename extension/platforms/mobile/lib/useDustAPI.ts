import { DustAPI } from "@dust-tt/client";
import { useMemo } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { MobileAuthService } from "@/lib/services/auth";
import { storageService } from "@/lib/services/storage";

const authService = new MobileAuthService(storageService);

interface UseDustAPIOptions {
  disabled?: boolean;
}

export function useDustAPI(options?: UseDustAPIOptions): DustAPI | null;
export function useDustAPI(options: { disabled: false }): DustAPI;
export function useDustAPI(options?: UseDustAPIOptions): DustAPI | null {
  const { user, isAuthenticated } = useAuth();
  const disabled = options?.disabled ?? false;

  const canCreateAPI =
    !disabled && isAuthenticated && user && user.selectedWorkspace;

  return useMemo(() => {
    if (!canCreateAPI || !user || !user.selectedWorkspace) {
      return null;
    }

    return new DustAPI(
      { url: user.dustDomain },
      {
        apiKey: () => authService.getAccessToken(),
        workspaceId: user.selectedWorkspace,
        extraHeaders: {
          "X-Request-Origin": "mobile",
        },
      },
      console
    );
  }, [canCreateAPI, user]);
}
