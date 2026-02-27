import {
  generateSandboxExecToken,
  SANDBOX_TOKEN_PREFIX,
  verifySandboxExecToken,
} from "@app/lib/api/sandbox/access_tokens";

import jwt from "jsonwebtoken";
import { describe, expect, test, vi } from "vitest";

const TEST_SECRET = "test-sandbox-jwt-secret";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getSandboxJwtSecret: () => TEST_SECRET,
  },
}));

const TOKEN_ARGS = {
  workspaceId: "wks_abc123",
  conversationId: "cnv_def456",
  userId: "usr_ghi789",
  sandboxId: "sbx_jkl012",
} as const;

describe("sandbox access tokens", () => {
  test("round-trip: generate → verify → check claims", () => {
    const token = generateSandboxExecToken(TOKEN_ARGS);

    expect(token.startsWith(SANDBOX_TOKEN_PREFIX)).toBe(true);

    const payload = verifySandboxExecToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.wId).toBe(TOKEN_ARGS.workspaceId);
    expect(payload!.cId).toBe(TOKEN_ARGS.conversationId);
    expect(payload!.uId).toBe(TOKEN_ARGS.userId);
    expect(payload!.sbId).toBe(TOKEN_ARGS.sandboxId);
  });

  test("tampered token is rejected", () => {
    const token = generateSandboxExecToken(TOKEN_ARGS);

    // Decode, modify, re-sign with a wrong secret.
    const jwtPart = token.slice(SANDBOX_TOKEN_PREFIX.length);
    const decoded = jwt.decode(jwtPart) as Record<string, unknown>;
    const tampered =
      SANDBOX_TOKEN_PREFIX +
      jwt.sign({ ...decoded, wId: "hacked" }, "wrong-secret", {
        algorithm: "HS256",
      });

    const payload = verifySandboxExecToken(tampered);
    expect(payload).toBeNull();
  });

  test("token without sbt- prefix is rejected", () => {
    const token = generateSandboxExecToken(TOKEN_ARGS);
    const raw = token.slice(SANDBOX_TOKEN_PREFIX.length);

    expect(verifySandboxExecToken(raw)).toBeNull();
  });
});
