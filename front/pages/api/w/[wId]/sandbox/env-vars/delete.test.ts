import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { describe, expect, it } from "vitest";

process.env.DUST_DEVELOPERS_SECRETS_SECRET ??= "test-developer-secret";

import handler from "./[id]";

async function createDeleteRequest({
  role = "admin",
}: {
  role?: "admin" | "builder" | "user";
} = {}) {
  const request = await createPrivateApiMockRequest({
    method: "DELETE",
    role,
  });
  await FeatureFlagFactory.basic(request.auth, "sandbox_tools");
  return request;
}

describe("DELETE /api/w/[wId]/sandbox/env-vars/[id]", () => {
  it("deletes an existing sandbox environment variable", async () => {
    const { req, res, auth } = await createDeleteRequest();

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
    const { req, res, auth } = await createDeleteRequest();

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
    const { req, res } = await createDeleteRequest({ role: "user" });
    req.query.id = "sev_placeholder";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });
});
