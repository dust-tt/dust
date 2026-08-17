import {
  buildFcmDataOnlyProviderOutput,
  FCM_DATA_ONLY_TRIGGER_OVERRIDES,
} from "@app/lib/notifications/mobile-push";
import { describe, expect, it } from "vitest";

describe("mobile push provider configuration", () => {
  it("selects FCM data mode at trigger time", () => {
    expect(FCM_DATA_ONLY_TRIGGER_OVERRIDES).toEqual({
      providers: {
        fcm: {
          type: "data",
        },
      },
    });
  });

  it("keeps Dust data and Android delivery settings in the FCM message", () => {
    expect(
      buildFcmDataOnlyProviderOutput({
        data: { dust_type: "conversation_unread" },
        priority: "high",
      })
    ).toEqual({
      data: { dust_type: "conversation_unread" },
      android: {
        priority: "high",
        ttl: 86_400_000,
      },
    });
  });
});
