import { shouldRelayToOtherRegion } from "@app/pages/api/email/webhook";
import { describe, expect, it } from "vitest";

describe("shouldRelayToOtherRegion", () => {
  it("relays first-hop user and workspace misses", () => {
    expect(
      shouldRelayToOtherRegion({
        req: { headers: {} },
        error: {
          type: "user_not_found",
          message: "user missing",
        },
      })
    ).toBe(true);

    expect(
      shouldRelayToOtherRegion({
        req: { headers: {} },
        error: {
          type: "workspace_not_found",
          message: "workspace missing",
        },
      })
    ).toBe(true);
  });

  it("does not relay requests that were already forwarded", () => {
    expect(
      shouldRelayToOtherRegion({
        req: {
          headers: {
            "x-dust-email-webhook-relayed": "1",
          },
        },
        error: {
          type: "user_not_found",
          message: "user missing",
        },
      })
    ).toBe(false);
  });

  it("does not relay unrelated email errors", () => {
    expect(
      shouldRelayToOtherRegion({
        req: { headers: {} },
        error: {
          type: "invalid_email_error",
          message: "bad recipient",
        },
      })
    ).toBe(false);
  });
});
