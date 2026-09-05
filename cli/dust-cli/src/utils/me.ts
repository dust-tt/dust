import type { DustAPI } from "@dust-tt/client";
import { Ok } from "@dust-tt/client";

/**
 * Resolves the current user, transparently handling API key authentication.
 *
 * `dustClient.me()` requires an OAuth token and always fails with a workspace
 * API key (which authenticates as a workspace, not a user). For API key auth we
 * return a placeholder user so callers can still resolve identity fields
 * (username / fullName / email) without a failing round-trip.
 */
export async function getMe(dustClient: DustAPI): ReturnType<DustAPI["me"]> {
  const apiKey = await dustClient.getApiKey();
  if (apiKey?.startsWith("sk-")) {
    return new Ok({
      sId: "api-user",
      id: 0, // ModelId type, using 0 as placeholder
      createdAt: Date.now(),
      provider: "google", // Default provider
      username: "api-user",
      email: "api-user@workspace",
      firstName: "API",
      lastName: "User",
      fullName: "API User",
      image: null,
      workspaces: [], // Will be empty for API keys
    });
  }

  return dustClient.me();
}
