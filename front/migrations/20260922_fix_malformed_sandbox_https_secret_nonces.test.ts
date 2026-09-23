import { randomBytes } from "node:crypto";

import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { fixWorkspaceNonces } from "@app/migrations/20260922_fix_malformed_sandbox_https_secret_nonces";
import baseLogger from "@app/logger/logger";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxEnvVarFactory } from "@app/tests/utils/SandboxEnvVarFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEventDirect } = vi.hoisted(() => ({
  mockEmitAuditLogEventDirect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEventDirect: mockEmitAuditLogEventDirect };
});

const logger = baseLogger.child({}, { level: "silent" });

// What the relocation path stored before it revived Buffers: the JSON text of
// the serialized nonce, as bytes.
function malformedNonce(): Buffer {
  return Buffer.from(JSON.stringify(randomBytes(16)));
}

describe("fixWorkspaceNonces", () => {
  beforeEach(() => {
    mockEmitAuditLogEventDirect.mockClear();
  });

  it("regenerates malformed nonces, audits them and leaves healthy rows alone", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const healthyNonce = randomBytes(16);
    await SandboxEnvVarFactory.create(authenticator, {
      name: "HEALTHY",
      kind: "https_secret",
      placeholderNonce: healthyNonce,
      allowedDomains: ["api.example.com"],
    });
    const malformed = await SandboxEnvVarFactory.create(authenticator, {
      name: "MALFORMED",
      kind: "https_secret",
      placeholderNonce: malformedNonce(),
      allowedDomains: ["api.example.com"],
    });
    const alsoMalformed = await SandboxEnvVarFactory.create(authenticator, {
      name: "ALSO_MALFORMED",
      kind: "https_secret",
      placeholderNonce: malformedNonce(),
      allowedDomains: ["other.example.com"],
    });
    // Config vars never carry a nonce and must not be touched.
    await SandboxEnvVarFactory.create(authenticator, { name: "CONFIG" });

    const scope = { kind: "workspace" as const, workspace };
    const reload = (name: string) =>
      SandboxEnvVarResource.fetchByName(authenticator, scope, name);

    await expect(
      fixWorkspaceNonces(workspace, { execute: false, logger })
    ).resolves.toBe(2);
    const untouched = await reload("MALFORMED");
    expect(untouched?.placeholderNonce).toEqual(malformed.placeholderNonce);
    expect(mockEmitAuditLogEventDirect).not.toHaveBeenCalled();

    await expect(
      fixWorkspaceNonces(workspace, { execute: true, logger })
    ).resolves.toBe(2);

    const fixed = await reload("MALFORMED");
    const alsoFixed = await reload("ALSO_MALFORMED");
    expect(fixed?.placeholderNonce?.length).toBe(16);
    expect(alsoFixed?.placeholderNonce?.length).toBe(16);
    expect(fixed?.placeholderNonce).not.toEqual(malformed.placeholderNonce);
    expect(alsoFixed?.placeholderNonce).not.toEqual(
      alsoMalformed.placeholderNonce
    );
    expect(fixed?.placeholderNonce).not.toEqual(alsoFixed?.placeholderNonce);

    const stillHealthy = await reload("HEALTHY");
    expect(stillHealthy?.placeholderNonce).toEqual(healthyNonce);

    expect(mockEmitAuditLogEventDirect).toHaveBeenCalledTimes(2);
    expect(mockEmitAuditLogEventDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sandbox_env_var.updated",
        actor: expect.objectContaining({ type: "system" }),
        targets: [
          expect.objectContaining({ type: "workspace", id: workspace.sId }),
          expect.objectContaining({
            type: "sandbox_env_var",
            id: fixed?.sId,
            name: "DSEC_MALFORMED",
          }),
        ],
        metadata: expect.objectContaining({
          name: "DSEC_MALFORMED",
          kind: "https_secret",
          allowed_domains: JSON.stringify(["api.example.com"]),
          previously_existed: "true",
        }),
      })
    );

    await expect(
      fixWorkspaceNonces(workspace, { execute: true, logger })
    ).resolves.toBe(0);
  });
});
