import { makeSId } from "@app/lib/resources/string_ids";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn(),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();

  return {
    ...actual,
    emitAuditLogEvent: mockEmitAuditLogEvent,
  };
});

process.env.DUST_DEVELOPERS_SECRETS_SECRET ??= "test-developer-secret";

import handler from "./[id]";

async function createEnvVarIdRequest({
  method,
  role = "admin",
  body,
}: {
  method: "DELETE" | "PATCH";
  role?: "admin" | "builder" | "user";
  body?: unknown;
}) {
  const request = await createPrivateApiMockRequest({
    method,
    role,
  });
  await FeatureFlagFactory.basic(request.auth, "sandbox_tools");
  await FeatureFlagFactory.basic(request.auth, "sandbox_workspace_admin");
  request.req.body = body;
  return request;
}

describe("PATCH/DELETE /api/w/[wId]/sandbox/env-vars/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes an existing sandbox environment variable", async () => {
    const { req, res, auth } = await createEnvVarIdRequest({
      method: "DELETE",
    });

    const upsertResult = await WorkspaceSandboxEnvVarResource.upsert(auth, {
      name: "API_TOKEN",
      value: "super-secret-token",
    });
    expect(upsertResult.isOk()).toBe(true);
    if (upsertResult.isErr()) {
      throw upsertResult.error;
    }
    req.query.id = upsertResult.value.resource.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ success: true });
    expect(
      await WorkspaceSandboxEnvVarResource.fetchByName(auth, "API_TOKEN")
    ).toBeNull();
  });

  it("returns 404 for a missing sandbox environment variable", async () => {
    const { req, res, auth } = await createEnvVarIdRequest({
      method: "DELETE",
    });

    const upsertResult = await WorkspaceSandboxEnvVarResource.upsert(auth, {
      name: "API_TOKEN",
      value: "super-secret-token",
    });
    expect(upsertResult.isOk()).toBe(true);
    if (upsertResult.isErr()) {
      throw upsertResult.error;
    }
    const staleSId = upsertResult.value.resource.sId;
    await upsertResult.value.resource.delete(auth);

    req.query.id = staleSId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("rejects non-admin deletes", async () => {
    const { req, res } = await createEnvVarIdRequest({
      method: "DELETE",
      role: "user",
    });
    req.query.id = makeSId("sandbox_env_var", { id: 1, workspaceId: 1 });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  it("promotes config variables to HTTPS secrets", async () => {
    const { req, res, auth } = await createEnvVarIdRequest({
      method: "PATCH",
      body: {
        kind: "https_secret",
        allowedDomains: [" API.GitHub.COM. "],
      },
    });

    const createResult = await WorkspaceSandboxEnvVarResource.makeNew(auth, {
      name: "API_TOKEN",
      value: "super-secret-token",
    });
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }
    req.query.id = createResult.value.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseBody = JSON.parse(res._getData());
    expect(responseBody).toEqual({
      envVar: expect.objectContaining({
        name: "DSEC_API_TOKEN",
        kind: "https_secret",
        allowedDomains: ["api.github.com"],
      }),
    });
    expect(responseBody.envVar.placeholderNonce).toMatch(/^[0-9a-f]{32}$/);

    const envResult = await WorkspaceSandboxEnvVarResource.loadEnv(auth);
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({});

    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sandbox_env_var.promoted_to_https_secret",
        metadata: expect.objectContaining({
          name: "DSEC_API_TOKEN",
          previous_name: "DST_API_TOKEN",
          allowed_domains: JSON.stringify(["api.github.com"]),
        }),
      })
    );
  });

  it("updates HTTPS secret allowed domains", async () => {
    const setup = await createEnvVarIdRequest({
      method: "PATCH",
      body: {
        allowedDomains: ["api.openai.com"],
      },
    });

    const createResult = await WorkspaceSandboxEnvVarResource.makeNew(
      setup.auth,
      {
        name: "API_TOKEN",
        kind: "https_secret",
        value: "super-secret-token",
        allowedDomains: ["api.github.com"],
      }
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }
    setup.req.query.id = createResult.value.sId;

    await handler(setup.req, setup.res);

    expect(setup.res._getStatusCode()).toBe(200);
    expect(JSON.parse(setup.res._getData())).toEqual({
      envVar: expect.objectContaining({
        name: "DSEC_API_TOKEN",
        allowedDomains: ["api.openai.com"],
      }),
    });
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sandbox_env_var.allowed_domains_updated",
        metadata: expect.objectContaining({
          name: "DSEC_API_TOKEN",
          allowed_domains: JSON.stringify(["api.openai.com"]),
          previous_allowed_domains: JSON.stringify(["api.github.com"]),
        }),
      })
    );
  });

  it("rejects demoting an HTTPS secret to a config variable", async () => {
    const { req, res, auth } = await createEnvVarIdRequest({
      method: "PATCH",
      body: { kind: "config" },
    });

    const createResult = await WorkspaceSandboxEnvVarResource.makeNew(auth, {
      name: "API_TOKEN",
      kind: "https_secret",
      value: "super-secret-token",
      allowedDomains: ["api.github.com"],
    });
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }
    req.query.id = createResult.value.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });
});
