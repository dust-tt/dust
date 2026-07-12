import type { SandboxEnvVarScope } from "@app/lib/api/sandbox/env_vars";
import type { Authenticator } from "@app/lib/auth";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { SandboxEnvVarModel } from "@app/lib/resources/storage/models/sandbox_env_var";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxEnvVarFactory } from "@app/tests/utils/SandboxEnvVarFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { decrypt } from "@app/types/shared/utils/encryption";
import { describe, expect, it } from "vitest";

function wsScope(auth: Authenticator): SandboxEnvVarScope {
  return { kind: "workspace", workspace: auth.getNonNullableWorkspace() };
}

function podScope(pod: SpaceResource): SandboxEnvVarScope {
  return { kind: "pod", pod };
}

describe("SandboxEnvVarResource", () => {
  it("encrypts values at rest and decrypts them via loadEnv", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const user = authenticator.getNonNullableUser();

    const upsertResult = await SandboxEnvVarResource.upsert(
      authenticator,
      wsScope(authenticator),
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

    const row = await SandboxEnvVarModel.findOne({
      where: {
        workspaceId: authenticator.getNonNullableWorkspace().id,
        name: "API_TOKEN",
      },
    });
    expect(row?.encryptedValue).toBeDefined();
    expect(row?.encryptedValue).not.toBe("super-secret-token");

    const envResult = await SandboxEnvVarResource.loadEnv(
      authenticator,
      wsScope(authenticator)
    );
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({
      DST_API_TOKEN: "super-secret-token",
    });

    const listed = await SandboxEnvVarResource.listForScope(
      authenticator,
      wsScope(authenticator)
    );
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

    const envResult = await SandboxEnvVarResource.loadEnv(
      authenticator,
      wsScope(authenticator)
    );
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({});
  });

  it("fails closed when a stored value cannot be decrypted", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    await SandboxEnvVarFactory.create(authenticator, {
      name: "API_TOKEN",
      encryptedValue: "not-valid-ciphertext",
    });

    const envResult = await SandboxEnvVarResource.loadEnv(
      authenticator,
      wsScope(authenticator)
    );
    expect(envResult.isErr()).toBe(true);
    if (envResult.isErr()) {
      expect(envResult.error.message).toContain("DST_API_TOKEN");
    }
  });

  it("rejects duplicate names within the workspace without clobbering", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const first = await SandboxEnvVarResource.makeNew(
      authenticator,
      wsScope(authenticator),
      { name: "CONFIG_TOKEN", value: "initial-value" }
    );
    expect(first.isOk()).toBe(true);

    const second = await SandboxEnvVarResource.makeNew(
      authenticator,
      wsScope(authenticator),
      { name: "CONFIG_TOKEN", value: "other-value" }
    );
    expect(second.isErr()).toBe(true);

    const envResult = await SandboxEnvVarResource.loadEnv(
      authenticator,
      wsScope(authenticator)
    );
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({ DST_CONFIG_TOKEN: "initial-value" });
  });

  it("creates HTTPS secrets with stable nonce and normalized allowed domains", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const createResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      wsScope(authenticator),
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

    const updateValueResult = await created.updateValue(
      authenticator,
      wsScope(authenticator),
      {
        value: "rotated-token",
      }
    );
    expect(updateValueResult.isOk()).toBe(true);
    if (updateValueResult.isErr()) {
      throw updateValueResult.error;
    }
    expect(updateValueResult.value.toJSON().placeholderNonce).toBe(
      initialNonce
    );

    const updateAllowedDomainsResult =
      await updateValueResult.value.updateAllowedDomains(
        authenticator,
        wsScope(authenticator),
        {
          allowedDomains: ["api.openai.com"],
        }
      );
    expect(updateAllowedDomainsResult.isOk()).toBe(true);
    if (updateAllowedDomainsResult.isErr()) {
      throw updateAllowedDomainsResult.error;
    }
    expect(updateAllowedDomainsResult.value.toJSON()).toMatchObject({
      placeholderNonce: initialNonce,
      allowedDomains: ["api.openai.com"],
    });

    const configResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      wsScope(authenticator),
      {
        name: "CONFIG_TOKEN",
        value: "config-token",
      }
    );
    expect(configResult.isOk()).toBe(true);

    const envResult = await SandboxEnvVarResource.loadEnv(
      authenticator,
      wsScope(authenticator)
    );
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({
      DST_CONFIG_TOKEN: "config-token",
    });

    const placeholderEnvResult =
      await SandboxEnvVarResource.loadHttpsSecretPlaceholderEnv(
        authenticator,
        wsScope(authenticator)
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

    const createResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      wsScope(authenticator),
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
      wsScope(authenticator),
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

    const envResult = await SandboxEnvVarResource.loadEnv(
      authenticator,
      wsScope(authenticator)
    );
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({});

    const placeholderEnvResult =
      await SandboxEnvVarResource.loadHttpsSecretPlaceholderEnv(
        authenticator,
        wsScope(authenticator)
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

    const createResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      wsScope(authenticator),
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

    const upsertResult = await SandboxEnvVarResource.upsert(
      authenticator,
      wsScope(authenticator),
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

    const multilineConfig = await SandboxEnvVarResource.makeNew(
      authenticator,
      wsScope(authenticator),
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
      const result = await SandboxEnvVarResource.makeNew(
        authenticator,
        wsScope(authenticator),
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
      const result = await SandboxEnvVarResource.makeNew(
        authenticator,
        wsScope(authenticator),
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

describe("SandboxEnvVarResource pod scope", () => {
  async function setupPod() {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    return { authenticator, workspace, user, pod };
  }

  it("encrypts pod values under the pod scope key and decrypts via loadEnv", async () => {
    const { authenticator, pod } = await setupPod();

    const result = await SandboxEnvVarResource.makeNew(
      authenticator,
      podScope(pod),
      {
        name: "CONFIG_TOKEN",
        value: "pod-config-value",
      }
    );
    expect(result.isOk()).toBe(true);

    const row = await SandboxEnvVarModel.findOne({
      where: {
        workspaceId: authenticator.getNonNullableWorkspace().id,
        spaceId: pod.id,
        name: "CONFIG_TOKEN",
      },
    });
    expect(row?.encryptedValue).toBeDefined();
    expect(row?.encryptedValue).not.toBe("pod-config-value");
    // The ciphertext decrypts under the pod space sId, not the workspace sId.
    expect(
      decrypt({
        encrypted: row?.encryptedValue ?? "",
        key: pod.sId,
        useCase: "developer_secret",
      })
    ).toBe("pod-config-value");

    const envResult = await SandboxEnvVarResource.loadEnv(
      authenticator,
      podScope(pod),
      { kind: "pod", spaceId: pod.sId }
    );
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({ DST_CONFIG_TOKEN: "pod-config-value" });
  });

  it("exposes DSEC placeholders for pod https secrets", async () => {
    const { authenticator, pod } = await setupPod();

    const secretResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      podScope(pod),
      {
        name: "API_TOKEN",
        kind: "https_secret",
        value: "pod-api-secret",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(secretResult.isOk()).toBe(true);
    if (secretResult.isErr()) {
      throw secretResult.error;
    }

    const envResult = await SandboxEnvVarResource.loadHttpsSecretPlaceholderEnv(
      authenticator,
      podScope(pod),
      { kind: "pod", spaceId: pod.sId }
    );
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({
      DSEC_API_TOKEN: `__DSEC_${secretResult.value.toJSON().placeholderNonce}__`,
    });
  });

  it("keeps scopes isolated: shared names coexist, lists never cross", async () => {
    const { authenticator, workspace, user, pod } = await setupPod();
    const otherPod = await SpaceFactory.project(workspace, user.id);

    // The same name can exist at workspace scope, in this pod, and in
    // another pod — per-scope partial uniques.
    const workspaceResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      wsScope(authenticator),
      { name: "SHARED_TOKEN", value: "workspace-value" }
    );
    expect(workspaceResult.isOk()).toBe(true);
    const podResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      podScope(pod),
      { name: "SHARED_TOKEN", value: "pod-value" }
    );
    expect(podResult.isOk()).toBe(true);
    const otherPodResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      podScope(otherPod),
      { name: "SHARED_TOKEN", value: "other-pod-value" }
    );
    expect(otherPodResult.isOk()).toBe(true);

    const workspaceList = await SandboxEnvVarResource.listForScope(
      authenticator,
      wsScope(authenticator)
    );
    expect(workspaceList.map((envVar) => envVar.toJSON().spaceId)).toEqual([
      null,
    ]);

    const podList = await SandboxEnvVarResource.listForScope(
      authenticator,
      podScope(pod)
    );
    expect(podList.map((envVar) => envVar.toJSON().spaceId)).toEqual([pod.sId]);

    const podEnv = await SandboxEnvVarResource.loadEnv(
      authenticator,
      podScope(pod),
      { kind: "pod", spaceId: pod.sId }
    );
    expect(podEnv.isOk()).toBe(true);
    if (podEnv.isErr()) {
      throw podEnv.error;
    }
    expect(podEnv.value).toEqual({ DST_SHARED_TOKEN: "pod-value" });
  });

  it("rejects duplicate names within a pod without clobbering", async () => {
    const { authenticator, pod } = await setupPod();

    const first = await SandboxEnvVarResource.makeNew(
      authenticator,
      podScope(pod),
      { name: "CONFIG_TOKEN", value: "initial-value" }
    );
    expect(first.isOk()).toBe(true);

    const second = await SandboxEnvVarResource.makeNew(
      authenticator,
      podScope(pod),
      { name: "CONFIG_TOKEN", value: "other-value" }
    );
    expect(second.isErr()).toBe(true);

    const envResult = await SandboxEnvVarResource.loadEnv(
      authenticator,
      podScope(pod),
      { kind: "pod", spaceId: pod.sId }
    );
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({ DST_CONFIG_TOKEN: "initial-value" });
  });

  it("promotes a pod config var to an https secret", async () => {
    const { authenticator, pod } = await setupPod();

    const createResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      podScope(pod),
      { name: "API_TOKEN", value: "pod-api-secret" }
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }

    const promoteResult = await createResult.value.promoteToHttpsSecret(
      authenticator,
      podScope(pod),
      { allowedDomains: ["api.example.com"] }
    );
    expect(promoteResult.isOk()).toBe(true);
    if (promoteResult.isErr()) {
      throw promoteResult.error;
    }

    const fetched = await SandboxEnvVarResource.fetchById(
      authenticator,
      createResult.value.sId
    );
    expect(fetched?.kind).toBe("https_secret");
    expect(fetched?.placeholderNonce).not.toBeNull();
    expect(fetched?.allowedDomains).toEqual(["api.example.com"]);
  });

  it("rejects non-pod spaces", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });

    await expect(
      SandboxEnvVarResource.makeNew(authenticator, podScope(globalSpace), {
        name: "CONFIG_TOKEN",
        value: "config-value",
      })
    ).rejects.toThrow("Only pod spaces can have sandbox environment variables");
  });

  it("rejects pod boot loads for sandboxes not owned by the pod", async () => {
    const { authenticator, workspace, user, pod } = await setupPod();
    const otherPod = await SpaceFactory.project(workspace, user.id);

    await expect(
      SandboxEnvVarResource.loadEnv(authenticator, podScope(pod), {
        kind: "pod",
        spaceId: otherPod.sId,
      })
    ).rejects.toThrow(
      "Pod env vars can only be loaded for pod-owned sandboxes"
    );

    await expect(
      SandboxEnvVarResource.loadEnv(authenticator, podScope(pod), {
        kind: "conversation",
        conversationId: "conversation-test",
      })
    ).rejects.toThrow(
      "Pod env vars can only be loaded for pod-owned sandboxes"
    );

    await expect(
      SandboxEnvVarResource.loadEnv(authenticator, podScope(pod))
    ).rejects.toThrow(
      "Pod env vars can only be loaded for pod-owned sandboxes"
    );
  });

  it("rejects mutations through a scope the row does not belong to", async () => {
    const { authenticator, workspace, user, pod } = await setupPod();
    const otherPod = await SpaceFactory.project(workspace, user.id);

    const createResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      podScope(pod),
      { name: "API_TOKEN", value: "pod-api-secret" }
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }
    const resource = createResult.value;

    expect(resource.belongsToScope(podScope(pod))).toBe(true);
    expect(resource.belongsToScope(podScope(otherPod))).toBe(false);
    expect(resource.belongsToScope(wsScope(authenticator))).toBe(false);

    // Mutating through a mismatched scope must trip the ownership assert
    // before any re-encryption happens.
    await expect(
      resource.updateValue(authenticator, podScope(otherPod), {
        value: "nope",
      })
    ).rejects.toThrow(
      "Sandbox environment variable does not belong to this scope"
    );
    await expect(
      resource.updateValue(authenticator, wsScope(authenticator), {
        value: "nope",
      })
    ).rejects.toThrow(
      "Sandbox environment variable does not belong to this scope"
    );
  });
});
