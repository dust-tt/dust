import type { Authenticator } from "@app/lib/auth";
import { creditsExhaustedMessage } from "@app/temporal/agent_loop/activities/common";
import { describe, expect, it } from "vitest";

describe("creditsExhaustedMessage", () => {
  it("tells admins to purchase more credits", () => {
    const auth = { isAdmin: () => true } as unknown as Authenticator;
    expect(creditsExhaustedMessage(auth)).toBe(
      "Your workspace has run out of credits. Please purchase more credits to continue using Dust."
    );
  });

  it("tells members to contact their administrator", () => {
    const auth = { isAdmin: () => false } as unknown as Authenticator;
    expect(creditsExhaustedMessage(auth)).toBe(
      "Your workspace has run out of credits. Please contact your administrator to purchase more credits."
    );
  });
});
