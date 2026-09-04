import { MondayOAuthProvider } from "@app/lib/api/oauth/providers/monday";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getOAuthRedirectBaseUrl: () => "https://dust.tt",
    getOAuthMondayClientId: () => "client-id",
  },
}));

describe("MondayOAuthProvider.setupUri", () => {
  it("uses the scopes configured in the Monday app", () => {
    const provider = new MondayOAuthProvider();
    const setupUri = provider.setupUri({
      connection: {
        connection_id: "connection-id",
        created: Date.now(),
        metadata: {},
        provider: "monday",
        status: "pending",
      },
      useCase: "personal_actions",
    });

    const url = new URL(setupUri);

    expect(url.searchParams.has("scope")).toBe(false);
  });
});
