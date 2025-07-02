import { DustAPI } from "@dust-tt/client";
import AuthService from "../authService.js";

export const useDustAPI = async () => {
  const commitHash = process.env.COMMIT_HASH;
  const cliVersion = process.env.VERSION;
  if (!AuthService.isAuthenticated) {
    throw new Error("Not authenticated");
  }

  const workspaceId = await AuthService.getSelectedWorkspaceId();
  if (!workspaceId) {
    throw new Error("No valid workspace");
  }

  if (!process.env.NODE_ENV) {
    throw new Error("Dust domain or node env not set");
  }

  return new DustAPI(
    {
      url: user.dustDomain,
    },
    {
      apiKey: () => AuthService.getValidAccessToken(),
      workspaceId: workspaceId,
      extraHeaders: {
        "X-Dust-Cli-Version": cliVersion || "development",
        "X-Commit-Hash": commitHash || "development",
      },
    },
    console
  );
};
