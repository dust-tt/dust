import { WorkspaceSandboxEnvVarModel } from "@app/lib/resources/storage/models/workspace_sandbox_env_var";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import logger from "@app/logger/logger";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { afterEach, describe, expect, it, vi } from "vitest";

process.env.DUST_DEVELOPERS_SECRETS_SECRET ??= "test-developer-secret";

describe("WorkspaceSandboxEnvVarResource", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encrypts values at rest and decrypts them for sandbox provisioning", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const user = authenticator.getNonNullableUser();

    const upsertResult = await WorkspaceSandboxEnvVarResource.upsert(
      authenticator,
      {
        name: "API_TOKEN",
        value: "super-secret-token",
        user,
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
      await WorkspaceSandboxEnvVarResource.loadEnvForSandboxProvisioning(
        authenticator
      );
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

  it("returns empty env maps and logs use-case-tagged counts for empty workspaces", async () => {
    const loggerInfoSpy = vi.spyOn(logger, "info");
    const { authenticator } = await createResourceTest({ role: "admin" });

    const provisioningResult =
      await WorkspaceSandboxEnvVarResource.loadEnvForSandboxProvisioning(
        authenticator
      );
    const redactionResult =
      await WorkspaceSandboxEnvVarResource.loadEnvForRedaction(authenticator);

    expect(provisioningResult.isOk()).toBe(true);
    expect(redactionResult.isOk()).toBe(true);
    if (provisioningResult.isErr() || redactionResult.isErr()) {
      throw new Error("Unexpected failed env load");
    }
    expect(provisioningResult.value).toEqual({});
    expect(redactionResult.value).toEqual({});
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: authenticator.getNonNullableWorkspace().sId,
        useCase: "provision",
        count: 0,
      }),
      "Loading workspace sandbox environment variables"
    );
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: authenticator.getNonNullableWorkspace().sId,
        useCase: "redact",
        count: 0,
      }),
      "Loading workspace sandbox environment variables"
    );
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

    const provisioningResult =
      await WorkspaceSandboxEnvVarResource.loadEnvForSandboxProvisioning(
        authenticator
      );
    const redactionResult =
      await WorkspaceSandboxEnvVarResource.loadEnvForRedaction(authenticator);

    expect(provisioningResult.isErr()).toBe(true);
    expect(redactionResult.isErr()).toBe(true);
    if (provisioningResult.isErr()) {
      expect(provisioningResult.error.message).toContain("API_TOKEN");
    }
    if (redactionResult.isErr()) {
      expect(redactionResult.error.message).toContain("API_TOKEN");
    }
  });
});
