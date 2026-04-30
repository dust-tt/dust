import { WorkspaceSandboxEnvVarModel } from "@app/lib/resources/storage/models/workspace_sandbox_env_var";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("WorkspaceSandboxEnvVarResource", () => {
  it("encrypts values at rest and decrypts them via loadEnv", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const user = authenticator.getNonNullableUser();

    const upsertResult = await WorkspaceSandboxEnvVarResource.upsert(
      authenticator,
      {
        name: "API_TOKEN",
        value: "super-secret-token",
      }
    );

    expect(upsertResult.isOk()).toBe(true);
    if (upsertResult.isErr()) {
      throw upsertResult.error;
    }
    expect(upsertResult.value.created).toBe(true);

    const row = await WorkspaceSandboxEnvVarModel.findOne({
      where: {
        workspaceId: authenticator.getNonNullableWorkspace().id,
        name: "API_TOKEN",
      },
    });
    expect(row?.encryptedValue).toBeDefined();
    expect(row?.encryptedValue).not.toBe("super-secret-token");

    const envResult =
      await WorkspaceSandboxEnvVarResource.loadEnv(authenticator);
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({
      API_TOKEN: "super-secret-token",
    });

    const listed =
      await WorkspaceSandboxEnvVarResource.listForWorkspace(authenticator);
    expect(listed.map((envVar) => envVar.toJSON())).toEqual([
      expect.objectContaining({
        name: "API_TOKEN",
        createdByName: user.name,
        lastUpdatedByName: user.name,
      }),
    ]);
    expect(
      JSON.stringify(listed.map((envVar) => envVar.toJSON()))
    ).not.toContain("super-secret-token");
  });

  it("returns an empty env map for a workspace with no vars", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const envResult =
      await WorkspaceSandboxEnvVarResource.loadEnv(authenticator);
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({});
  });

  it("fails closed when a stored value cannot be decrypted", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const user = authenticator.getNonNullableUser();

    await WorkspaceSandboxEnvVarModel.create({
      workspaceId: authenticator.getNonNullableWorkspace().id,
      name: "API_TOKEN",
      encryptedValue: "not-valid-ciphertext",
      createdByUserId: user.id,
      lastUpdatedByUserId: user.id,
    });

    const envResult =
      await WorkspaceSandboxEnvVarResource.loadEnv(authenticator);
    expect(envResult.isErr()).toBe(true);
    if (envResult.isErr()) {
      expect(envResult.error.message).toContain("API_TOKEN");
    }
  });
});
