import { SnowflakeOAuthProvider } from "@app/lib/api/oauth/providers/snowflake";
import { describe, expect, it } from "vitest";

const VALID_CONFIG = {
  client_id: "client-id",
  client_secret: "client-secret",
  snowflake_account: "abc123.us-east-1",
  snowflake_role: "ANALYST",
  snowflake_warehouse: "COMPUTE_WH",
};

describe("SnowflakeOAuthProvider.isExtraConfigValid", () => {
  it("accepts a well-formed account identifier", () => {
    const provider = new SnowflakeOAuthProvider();

    expect(provider.isExtraConfigValid(VALID_CONFIG, "platform_actions")).toBe(
      true
    );
    expect(provider.isExtraConfigValid(VALID_CONFIG, "personal_actions")).toBe(
      true
    );
  });

  it("rejects account identifiers that would change the URL host", () => {
    const provider = new SnowflakeOAuthProvider();

    for (const snowflake_account of [
      "evil.example/x?",
      "attacker.internal:8443/p?",
      "user:pw@host/?",
      "evil-1.example#",
      "evil-1.example\\x",
    ]) {
      for (const useCase of ["platform_actions", "personal_actions"] as const) {
        expect(
          provider.isExtraConfigValid(
            { ...VALID_CONFIG, snowflake_account },
            useCase
          )
        ).toBe(false);
      }
    }
  });
});
