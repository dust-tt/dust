import config from "@app/lib/api/config";
import {
  decryptForRelocationTransport,
  encryptForRelocationTransport,
} from "@app/temporal/relocation/lib/secrets";
import { afterEach, describe, expect, it, vi } from "vitest";

const CONTEXT = {
  workflowId: "workspaceRelocateFrontWorkflow-w_123",
  workspaceId: "w_123",
  secret: {
    tableName: "dust_app_secrets",
    id: 42,
    key: "w_123",
  },
} as const;

describe("relocation transport encryption", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["front-api-key", "", "clé-🔑-秘密"])(
    "decrypts back to the original plaintext (%j)",
    (plaintext) => {
      const transportValue = encryptForRelocationTransport(plaintext, CONTEXT);

      expect(decryptForRelocationTransport(transportValue, CONTEXT)).toBe(
        plaintext
      );
    }
  );

  it("uses a fresh IV per value, so the same plaintext encrypts differently", () => {
    const first = encryptForRelocationTransport("front-api-key", CONTEXT);
    const second = encryptForRelocationTransport("front-api-key", CONTEXT);

    expect(first).not.toBe(second);
    expect(decryptForRelocationTransport(first, CONTEXT)).toBe("front-api-key");
    expect(decryptForRelocationTransport(second, CONTEXT)).toBe(
      "front-api-key"
    );
  });

  it.each([
    { field: "workspaceId", context: { ...CONTEXT, workspaceId: "w_other" } },
    {
      field: "tableName",
      context: {
        ...CONTEXT,
        secret: { ...CONTEXT.secret, tableName: "workspace_sandbox_env_vars" },
      },
    },
    {
      field: "row id",
      context: { ...CONTEXT, secret: { ...CONTEXT.secret, id: 43 } },
    },
    {
      field: "secret sId",
      context: { ...CONTEXT, secret: { ...CONTEXT.secret, key: "w_456" } },
    },
  ] as const)("fails to decrypt when the $field differs", ({ context }) => {
    const transportValue = encryptForRelocationTransport(
      "front-api-key",
      CONTEXT
    );

    expect(() =>
      decryptForRelocationTransport(transportValue, context)
    ).toThrow();
  });

  it("fails to decrypt under another relocation's workflow id", () => {
    const transportValue = encryptForRelocationTransport(
      "front-api-key",
      CONTEXT
    );

    expect(() =>
      decryptForRelocationTransport(transportValue, {
        ...CONTEXT,
        workflowId: "workspaceRelocateFrontWorkflow-w_other",
      })
    ).toThrow();
  });

  it("fails to decrypt when the cells do not share the same transport secret", () => {
    const transportValue = encryptForRelocationTransport(
      "front-api-key",
      CONTEXT
    );

    vi.spyOn(config, "getRelocationTransportSecret").mockReturnValue(
      "another-transport-secret"
    );

    expect(() =>
      decryptForRelocationTransport(transportValue, CONTEXT)
    ).toThrow();
  });

  it("fails to decrypt a tampered value", () => {
    const payload = Buffer.from(
      encryptForRelocationTransport("front-api-key", CONTEXT),
      "base64"
    );
    payload[payload.length - 1] ^= 0x01;

    expect(() =>
      decryptForRelocationTransport(payload.toString("base64"), CONTEXT)
    ).toThrow();
  });
});
