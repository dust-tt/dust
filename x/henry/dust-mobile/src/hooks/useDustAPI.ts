import { useMemo } from "react";
import { DustAPI } from "@dust-tt/client";
import { useAuthContext } from "../context/AuthContext";
import { getAccessToken } from "../services/auth";

export function useDustAPI(): DustAPI {
  const { user, selectedWorkspace } = useAuthContext();

  if (!user || !selectedWorkspace) {
    throw new Error("useDustAPI: not authenticated or no workspace selected");
  }

  return useMemo(() => {
    return new DustAPI(
      { url: user.dustDomain },
      {
        apiKey: () => getAccessToken().then((t) => t ?? ""),
        workspaceId: selectedWorkspace.sId,
        extraHeaders: {
          "X-Request-Origin": "mobile",
        },
      },
      console
    );
  }, [user.dustDomain, selectedWorkspace.sId]);
}
