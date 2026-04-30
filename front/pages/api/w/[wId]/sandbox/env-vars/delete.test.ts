import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { describe, expect, it } from "vitest";

process.env.DUST_DEVELOPERS_SECRETS_SECRET ??= "test-developer-secret";

import handler from "./[name]";

async function createDeleteRequest({
  role = "admin",
  name,
}: {
  role?: "admin" | "builder" | "user";
  name: string;
}) {
  const request = await createPrivateApiMockRequest({
    method: "DELETE",
    role,
  });
  await FeatureFlagFactory.basic(request.auth, "sandbox_tools");
  request.req.query.name = name;
  return request;
}

describe("DELETE /api/w/[wId]/sandbox/env-vars/[name]", () => {
  it("deletes an existing sandbox environment variable", async () => {
    const { req, res, auth } = await createDeleteRequest({
      name: "API_TOKEN",
    });

    const upsertResult = await WorkspaceSandboxEnvVarResource.upsert(auth, {
      name: "API_TOKEN",
      value: "super-secret-token",
    });
    expect(upsertResult.isOk()).toBe(true);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ success: true });
    expect(
      await WorkspaceSandboxEnvVarResource.fetchByName(auth, "API_TOKEN")
    ).toBeNull();
  });

  it("returns 404 for a missing sandbox environment variable", async () => {
    const { req, res } = await createDeleteRequest({
      name: "API_TOKEN",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("rejects non-admin deletes", async () => {
    const { req, res } = await createDeleteRequest({
      role: "user",
      name: "API_TOKEN",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });
});
