import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getDeveloperSecretsSecret: () => "test-encryption-secret",
    getMCPServerCredentialsSecret: () => "test-mcp-secret",
  },
}));

import { decrypt, encrypt } from "./encryption";

const key = "workspace-id";
const useCase = "developer_secret";

describe("encryption", () => {
  it("round-trips encrypted values", () => {
    const encrypted = encrypt({ text: "secret-token", key, useCase });

    expect(decrypt({ encrypted, key, useCase })).toBe("secret-token");
  });

  it("uses a random IV for each encrypted value", () => {
    const first = encrypt({ text: "secret-token", key, useCase });
    const second = encrypt({ text: "secret-token", key, useCase });

    expect(first).not.toBe(second);
    expect(first.startsWith("v2:")).toBe(true);
    expect(second.startsWith("v2:")).toBe(true);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encrypt({ text: "secret-token", key, useCase });
    const tampered = `${encrypted.slice(0, -1)}${
      encrypted.endsWith("0") ? "1" : "0"
    }`;

    expect(() => decrypt({ encrypted: tampered, key, useCase })).toThrow();
  });

  it("decrypts legacy deterministic-IV AES-CBC values", () => {
    expect(
      decrypt({
        encrypted: "7a498a6aa732fc1b2935786c945af8bf",
        key,
        useCase,
      })
    ).toBe("secret-token");
  });
});
