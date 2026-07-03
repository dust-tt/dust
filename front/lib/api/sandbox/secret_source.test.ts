import { encrypt } from "@app/types/shared/utils/encryption";
import { describe, expect, it } from "vitest";

import type { SecretSource } from "./secret_source";
import { buildSecretSourceFromRow, resolveSecretValue } from "./secret_source";

const EXTERNAL_SOURCES: SecretSource[] = [
  {
    kind: "onepassword-connect",
    connectServerUrl: "https://connect.example.com",
    accessToken: "token",
    vaultId: "vault-id",
    itemId: "item-id",
    fieldId: "password",
  },
  {
    kind: "aws-secrets-manager",
    secretArn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:foo",
    region: "us-east-1",
  },
  {
    kind: "vault",
    vaultUrl: "https://vault.example.com",
    appRoleId: "role-id",
    appSecretId: "secret-id",
    mountPath: "kv",
    secretPath: "apps/foo",
    key: "api_key",
  },
  {
    kind: "gcp-secret-manager",
    projectId: "my-project",
    secretName: "foo",
    serviceAccountKey: "{}",
  },
];

describe("resolveSecretValue", () => {
  it("resolves dust-managed secrets by decrypting with the scope key", async () => {
    const encrypted = encrypt({
      text: "s3cret-value",
      key: "pod-space-sid",
      useCase: "developer_secret",
    });

    const result = await resolveSecretValue(
      { kind: "dust-managed" },
      { encryptedValue: encrypted, encryptionKey: "pod-space-sid" }
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toBe("s3cret-value");
  });

  it("fails when a dust-managed secret has no encrypted value", async () => {
    const result = await resolveSecretValue(
      { kind: "dust-managed" },
      { encryptedValue: null, encryptionKey: "pod-space-sid" }
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected an error.");
    }
    expect(result.error.message).toContain("no encrypted value");
  });

  it("fails closed when the ciphertext cannot be decrypted", async () => {
    const encrypted = encrypt({
      text: "s3cret-value",
      key: "pod-space-sid",
      useCase: "developer_secret",
    });

    const result = await resolveSecretValue(
      { kind: "dust-managed" },
      { encryptedValue: encrypted, encryptionKey: "another-scope-key" }
    );

    expect(result.isErr()).toBe(true);
  });

  it.each(
    EXTERNAL_SOURCES.map((source) => [source.kind, source] as const)
  )("returns a clear 'not yet implemented' error for %s", async (kind, source) => {
    const result = await resolveSecretValue(source, {
      encryptedValue: null,
      encryptionKey: "pod-space-sid",
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected an error.");
    }
    expect(result.error.message).toBe(
      `Secret source '${kind}' is not yet implemented.`
    );
  });
});

describe("buildSecretSourceFromRow", () => {
  it("builds a dust-managed source", () => {
    const result = buildSecretSourceFromRow({
      secretSourceKind: "dust-managed",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual({ kind: "dust-managed" });
  });

  it("returns a 'not yet implemented' error for any other kind", () => {
    const result = buildSecretSourceFromRow({ secretSourceKind: "vault" });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected an error.");
    }
    expect(result.error.message).toBe(
      "Secret source 'vault' is not yet implemented."
    );
  });
});
