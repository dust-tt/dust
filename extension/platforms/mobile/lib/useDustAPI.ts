import { DustAPI } from "@dust-tt/client";
import { useMemo } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { MobileAuthService } from "@/lib/services/auth";
import { storageService } from "@/lib/services/storage";

const authService = new MobileAuthService(storageService);

export const useDustAPI = () => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user || !user.selectedWorkspace) {
    throw new Error("Not authenticated");
  }

  return useMemo(() => {
    return new DustAPI(
      { url: user.dustDomain },
      {
        apiKey: () => authService.getAccessToken(),
        workspaceId: user.selectedWorkspace!,
        extraHeaders: {
          "X-Request-Origin": "mobile",
        },
      },
      console
    );
  }, [user.dustDomain, user.selectedWorkspace]);
};
