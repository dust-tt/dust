import { CustomerioServerSideTracking } from "@app/lib/tracking/customerio/server";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getCustomerIoEnabled: () => true,
    getCustomerIoSiteId: () => "site-id",
    getCustomerIoApiKey: () => "api-key",
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const user = {
  sId: "user-sid",
  email: "user@example.com",
} as UserType;

const workspace = {
  sId: "ws-sid",
  name: "Workspace name",
} as LightWorkspaceType;

describe("CustomerioServerSideTracking._trackEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it("sends event attributes together with the workspace id and name", async () => {
    await CustomerioServerSideTracking._trackEvent({
      user,
      workspace,
      eventName: "role_updated",
      eventAttributes: { newRole: "admin", previousRole: "user" },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe(
      "https://track-eu.customer.io/api/v1/customers/user%40example.com/events"
    );
    expect(JSON.parse(calledInit.body)).toEqual({
      name: "role_updated",
      data: {
        newRole: "admin",
        previousRole: "user",
        workspace_id: "ws-sid",
        workspace_name: "Workspace name",
      },
    });
  });

  it("sends only the event attributes when no workspace is provided", async () => {
    await CustomerioServerSideTracking._trackEvent({
      user,
      eventName: "role_updated",
      eventAttributes: { newRole: "admin", previousRole: "user" },
    });

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      name: "role_updated",
      data: { newRole: "admin", previousRole: "user" },
    });
  });
});
