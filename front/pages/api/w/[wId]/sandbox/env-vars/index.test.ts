import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { WorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
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

import handler from "./index";

async function createEnvVarRequest({
  method,
  role = "admin",
  body,
}: {
  method: "GET" | "POST";
  role?: "admin" | "builder" | "user";
  body?: unknown;
}) {
  const request = await createPrivateApiMockRequest({ method, role });
  await FeatureFlagFactory.basic(request.auth, "sandbox_tools");
  request.req.body = body;
  return request;
}

function createEnvVarHttpRequest({
  method,
  workspace,
  body,
}: {
  method: "GET" | "POST";
  workspace: WorkspaceType;
  body?: unknown;
}) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    query: { wId: workspace.sId },
    headers: {},
  });
  req.body = body;

  return { req, res };
}

describe("GET/POST /api/w/[wId]/sandbox/env-vars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin GET and POST requests", async () => {
    const getRequest = await createEnvVarRequest({
      method: "GET",
      role: "user",
    });
    await handler(getRequest.req, getRequest.res);
    expect(getRequest.res._getStatusCode()).toBe(403);

    const postRequest = await createEnvVarRequest({
      method: "POST",
      role: "builder",
      body: { name: "API_TOKEN", value: "super-secret-token" },
    });
    await handler(postRequest.req, postRequest.res);
    expect(postRequest.res._getStatusCode()).toBe(403);
  });

  it("rejects invalid names and invalid values", async () => {
    for (const body of [
      { name: "api_token", value: "super-secret-token" },
      { name: "_API_TOKEN", value: "super-secret-token" },
      { name: "DUST_API_KEY", value: "super-secret-token" },
      { name: "API_TOKEN", value: "" },
      { name: "API_TOKEN", value: "abc\u0000def" },
      { name: "API_TOKEN", value: "a".repeat(32 * 1024 + 1) },
    ]) {
      const { req, res } = await createEnvVarRequest({
        method: "POST",
        body,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
    }
  });

  it("enforces the create cap while allowing overwrite at the cap", async () => {
    const { req, res, auth, workspace } = await createEnvVarRequest({
      method: "POST",
      body: { name: "NEW_TOKEN", value: "super-secret-token" },
    });

    for (let i = 0; i < 50; i++) {
      const seedResult = await WorkspaceSandboxEnvVarResource.upsert(auth, {
        name: `VAR_${i}`,
        value: `value-${i}`,
      });
      expect(seedResult.isOk()).toBe(true);
    }

    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchObject({
      error: {
        type: "invalid_request_error",
      },
    });

    const overwriteRequest = createEnvVarHttpRequest({
      method: "POST",
      workspace,
      body: { name: "VAR_0", value: "rotated-secret-token" },
    });

    await handler(overwriteRequest.req, overwriteRequest.res);
    expect(overwriteRequest.res._getStatusCode()).toBe(200);
    expect(JSON.parse(overwriteRequest.res._getData())).toEqual({
      envVar: expect.objectContaining({ name: "VAR_0" }),
      created: false,
    });

    const envResult = await WorkspaceSandboxEnvVarResource.loadEnv(auth);
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value.VAR_0).toBe("rotated-secret-token");
  });

  it("creates multiline values, overwrites by name, audits without values, and never lists values", async () => {
    const first = await createEnvVarRequest({
      method: "POST",
      body: {
        name: "API_TOKEN",
        value: "-----BEGIN KEY-----\nline two\n-----END KEY-----",
      },
    });
    await handler(first.req, first.res);
    expect(first.res._getStatusCode()).toBe(201);
    expect(JSON.parse(first.res._getData())).toEqual({
      envVar: expect.objectContaining({ name: "API_TOKEN" }),
      created: true,
    });

    const second = createEnvVarHttpRequest({
      method: "POST",
      workspace: first.workspace,
      body: {
        name: "API_TOKEN",
        value: "rotated-secret-token",
      },
    });
    await handler(second.req, second.res);
    expect(second.res._getStatusCode()).toBe(200);
    expect(JSON.parse(second.res._getData())).toEqual({
      envVar: expect.objectContaining({ name: "API_TOKEN" }),
      created: false,
    });

    const envResult = await WorkspaceSandboxEnvVarResource.loadEnv(first.auth);
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value.API_TOKEN).toBe("rotated-secret-token");

    const listRequest = createEnvVarHttpRequest({
      method: "GET",
      workspace: first.workspace,
    });
    await handler(listRequest.req, listRequest.res);
    expect(listRequest.res._getStatusCode()).toBe(200);
    const responseBody = JSON.parse(listRequest.res._getData());
    expect(responseBody).toEqual({
      envVars: [
        expect.objectContaining({
          name: "API_TOKEN",
        }),
      ],
    });
    expect(JSON.stringify(responseBody)).not.toContain("rotated-secret-token");

    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sandbox_env_var.created",
        metadata: { name: "API_TOKEN" },
      })
    );
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sandbox_env_var.updated",
        metadata: {
          name: "API_TOKEN",
          previously_existed: "true",
        },
      })
    );
    expect(JSON.stringify(mockEmitAuditLogEvent.mock.calls)).not.toContain(
      "rotated-secret-token"
    );
  });
});
