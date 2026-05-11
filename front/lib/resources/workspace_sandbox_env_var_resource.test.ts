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
      DST_API_TOKEN: "super-secret-token",
    });

    const listed =
      await WorkspaceSandboxEnvVarResource.listForWorkspace(authenticator);
    expect(listed.map((envVar) => envVar.toJSON())).toEqual([
      expect.objectContaining({
        name: "DST_API_TOKEN",
        kind: "config",
        placeholderNonce: null,
        allowedDomains: null,
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
      expect(envResult.error.message).toContain("DST_API_TOKEN");
    }
  });

  it("creates HTTPS secrets with stable nonce and normalized allowed domains", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const createResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "API_TOKEN",
        kind: "https_secret",
        value: "super-secret-token",
        allowedDomains: [" API.GitHub.COM. ", "*.Example.com"],
      }
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }

    const created = createResult.value;
    const createdJson = created.toJSON();
    expect(createdJson).toMatchObject({
      name: "DSEC_API_TOKEN",
      kind: "https_secret",
      allowedDomains: ["api.github.com", "*.example.com"],
    });
    expect(createdJson.placeholderNonce).toMatch(/^[0-9a-f]{32}$/);
    const initialNonce = createdJson.placeholderNonce;

    const updateValueResult = await created.updateValue(authenticator, {
      value: "rotated-token",
    });
    expect(updateValueResult.isOk()).toBe(true);
    if (updateValueResult.isErr()) {
      throw updateValueResult.error;
    }
    expect(updateValueResult.value.toJSON().placeholderNonce).toBe(
      initialNonce
    );

    const updateAllowedDomainsResult =
      await updateValueResult.value.updateAllowedDomains(authenticator, {
        allowedDomains: ["api.openai.com"],
      });
    expect(updateAllowedDomainsResult.isOk()).toBe(true);
    if (updateAllowedDomainsResult.isErr()) {
      throw updateAllowedDomainsResult.error;
    }
    expect(updateAllowedDomainsResult.value.toJSON()).toMatchObject({
      placeholderNonce: initialNonce,
      allowedDomains: ["api.openai.com"],
    });

    const configResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "CONFIG_TOKEN",
        value: "config-token",
      }
    );
    expect(configResult.isOk()).toBe(true);

    const envResult =
      await WorkspaceSandboxEnvVarResource.loadEnv(authenticator);
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({
      DST_CONFIG_TOKEN: "config-token",
    });

    const placeholderEnvResult =
      await WorkspaceSandboxEnvVarResource.loadHttpsSecretPlaceholderEnv(
        authenticator
      );
    expect(placeholderEnvResult.isOk()).toBe(true);
    if (placeholderEnvResult.isErr()) {
      throw placeholderEnvResult.error;
    }
    expect(placeholderEnvResult.value).toEqual({
      DSEC_API_TOKEN: `__DSEC_${initialNonce}__`,
    });
  });

  it("promotes config vars to HTTPS secrets and injects only the placeholder env", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const createResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "API_TOKEN",
        value: "super-secret-token",
      }
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }

    const promotedResult = await createResult.value.promoteToHttpsSecret(
      authenticator,
      {
        allowedDomains: [" API.GitHub.COM. "],
      }
    );
    expect(promotedResult.isOk()).toBe(true);
    if (promotedResult.isErr()) {
      throw promotedResult.error;
    }
    expect(promotedResult.value.toJSON()).toMatchObject({
      name: "DSEC_API_TOKEN",
      kind: "https_secret",
      allowedDomains: ["api.github.com"],
    });
    expect(promotedResult.value.toJSON().placeholderNonce).toMatch(
      /^[0-9a-f]{32}$/
    );

    const envResult =
      await WorkspaceSandboxEnvVarResource.loadEnv(authenticator);
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({});

    const placeholderEnvResult =
      await WorkspaceSandboxEnvVarResource.loadHttpsSecretPlaceholderEnv(
        authenticator
      );
    expect(placeholderEnvResult.isOk()).toBe(true);
    if (placeholderEnvResult.isErr()) {
      throw placeholderEnvResult.error;
    }
    expect(placeholderEnvResult.value).toEqual({
      DSEC_API_TOKEN: `__DSEC_${promotedResult.value.toJSON().placeholderNonce}__`,
    });
  });

  it("rotates HTTPS secret value and allowed domains in a single upsert", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const createResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
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
    const initialNonce = createResult.value.toJSON().placeholderNonce;

    const upsertResult = await WorkspaceSandboxEnvVarResource.upsert(
      authenticator,
      {
        name: "API_TOKEN",
        kind: "https_secret",
        value: "rotated-token",
        allowedDomains: ["api.openai.com"],
      }
    );
    expect(upsertResult.isOk()).toBe(true);
    if (upsertResult.isErr()) {
      throw upsertResult.error;
    }
    expect(upsertResult.value.created).toBe(false);
    expect(upsertResult.value.resource.toJSON()).toMatchObject({
      name: "DSEC_API_TOKEN",
      kind: "https_secret",
      allowedDomains: ["api.openai.com"],
      placeholderNonce: initialNonce,
    });
  });

  it("validates HTTPS secret values and allowed domains without changing config multiline values", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const multilineConfig = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "MULTILINE_CONFIG",
        value: "line one\nline two",
      }
    );
    expect(multilineConfig.isOk()).toBe(true);

    const invalidValues = [
      "line one\nline two",
      "carriage\rreturn",
      "abc\u0000def",
      "a".repeat(8 * 1024 + 1),
    ];
    for (const [index, value] of invalidValues.entries()) {
      const result = await WorkspaceSandboxEnvVarResource.makeNew(
        authenticator,
        {
          name: `SECRET_VALUE_${index}`,
          kind: "https_secret",
          value,
          allowedDomains: ["api.example.com"],
        }
      );
      expect(result.isErr()).toBe(true);
    }

    const invalidAllowedDomains = [undefined, [], ["127.0.0.1"]];
    for (const [index, allowedDomains] of invalidAllowedDomains.entries()) {
      const result = await WorkspaceSandboxEnvVarResource.makeNew(
        authenticator,
        {
          name: `SECRET_DOMAIN_${index}`,
          kind: "https_secret",
          value: "super-secret-token",
          allowedDomains,
        }
      );
      expect(result.isErr()).toBe(true);
    }
  });
});
