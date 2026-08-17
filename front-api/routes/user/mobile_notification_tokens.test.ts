import { getNovuClient } from "@app/lib/notifications/novu-client";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { sessionApp } from "@front-api/middlewares/ctx";
import { sessionAuth } from "@front-api/middlewares/session_auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

import mobileNotificationTokens from "./mobile_notification_tokens";

const novuMocks = vi.hoisted(() => ({
  create: vi.fn(),
  append: vi.fn(),
  update: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock("@app/lib/notifications/novu-client", () => ({
  getNovuClient: vi.fn().mockResolvedValue({
    subscribers: {
      create: novuMocks.create,
      retrieve: novuMocks.retrieve,
      credentials: {
        append: novuMocks.append,
        update: novuMocks.update,
      },
    },
  }),
}));

const testApp = sessionApp();
testApp.use("*", sessionAuth);
testApp.route("/api/user/mobile_notification_tokens", mobileNotificationTokens);

function mobileNotificationTokenRequest(
  method: "POST" | "DELETE",
  token: unknown
) {
  return testApp.request("/api/user/mobile_notification_tokens", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

describe("/api/user/mobile_notification_tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    novuMocks.retrieve.mockResolvedValue({ result: { channels: [] } });
  });

  it("registers an FCM token for the authenticated user", async () => {
    const { user } = await createPrivateApiMockRequest({ method: "POST" });

    const response = await mobileNotificationTokenRequest(
      "POST",
      "device-token"
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(novuMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriberId: user.sId,
        email: user.email,
      })
    );
    expect(novuMocks.append).toHaveBeenCalledWith(
      {
        providerId: "fcm",
        credentials: { deviceTokens: ["device-token"] },
      },
      user.sId
    );
  });

  it("does not append a token that is already registered", async () => {
    await createPrivateApiMockRequest({ method: "POST" });
    novuMocks.retrieve.mockResolvedValue({
      result: {
        channels: [
          {
            providerId: "fcm",
            credentials: { deviceTokens: ["device-token"] },
          },
        ],
      },
    });

    const response = await mobileNotificationTokenRequest(
      "POST",
      "device-token"
    );

    expect(response.status).toBe(200);
    expect(novuMocks.append).not.toHaveBeenCalled();
  });

  it("removes only the requested FCM token", async () => {
    const { user } = await createPrivateApiMockRequest({ method: "DELETE" });
    novuMocks.retrieve.mockResolvedValue({
      result: {
        channels: [
          {
            providerId: "fcm",
            integrationIdentifier: "dust-android",
            credentials: { deviceTokens: ["other-device", "device-token"] },
          },
          {
            providerId: "slack",
            credentials: {},
          },
        ],
      },
    });

    const response = await mobileNotificationTokenRequest(
      "DELETE",
      "device-token"
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(novuMocks.update).toHaveBeenCalledWith(
      {
        providerId: "fcm",
        integrationIdentifier: "dust-android",
        credentials: { deviceTokens: ["other-device"] },
      },
      user.sId
    );
  });

  it("rejects an empty token", async () => {
    await createPrivateApiMockRequest({ method: "POST" });

    const response = await mobileNotificationTokenRequest("POST", "   ");

    expect(response.status).toBe(400);
    expect(vi.mocked(getNovuClient)).not.toHaveBeenCalled();
  });
});
