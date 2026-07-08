import { buildPodEgressSecretEntries } from "@app/lib/api/sandbox/egress_secrets";
import { PodSandboxEnvVarResource } from "@app/lib/resources/pod_sandbox_env_var_resource";
import { PodSandboxEnvVarModel } from "@app/lib/resources/storage/models/pod_sandbox_env_var";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { describe, expect, it } from "vitest";

// Common setup: a pod with one config var and one https secret.
async function setupPodWithVars() {
  const { authenticator, workspace, user } = await createResourceTest({
    role: "admin",
  });
  const pod = await SpaceFactory.project(workspace, user.id);

  const configResult = await PodSandboxEnvVarResource.makeNew(
    authenticator,
    pod,
    {
      name: "CONFIG_TOKEN",
      value: "config-value",
    }
  );
  if (configResult.isErr()) {
    throw configResult.error;
  }

  const secretResult = await PodSandboxEnvVarResource.makeNew(
    authenticator,
    pod,
    {
      name: "API_TOKEN",
      kind: "https_secret",
      value: "api-secret",
      allowedDomains: ["api.example.com"],
    }
  );
  if (secretResult.isErr()) {
    throw secretResult.error;
  }

  return {
    authenticator,
    workspace,
    user,
    pod,
    configVar: configResult.value,
    secretVar: secretResult.value,
  };
}

describe("PodSandboxEnvVarResource", () => {
  it("lists pod env vars with user metadata and without values", async () => {
    const { authenticator, pod, user } = await setupPodWithVars();

    const listed = await PodSandboxEnvVarResource.listForPod(
      authenticator,
      pod
    );
    expect(listed.map((envVar) => envVar.toJSON())).toEqual([
      expect.objectContaining({
        name: "DSEC_API_TOKEN",
        kind: "https_secret",
        allowedDomains: ["api.example.com"],
        secretSourceKind: "dust-managed",
        createdByName: user.name,
        lastUpdatedByName: user.name,
      }),
      expect.objectContaining({
        name: "DST_CONFIG_TOKEN",
        kind: "config",
        placeholderNonce: null,
        allowedDomains: null,
        secretSourceKind: "dust-managed",
        createdByName: user.name,
        lastUpdatedByName: user.name,
      }),
    ]);
    expect(
      JSON.stringify(listed.map((envVar) => envVar.toJSON()))
    ).not.toContain("api-secret");
  });

  it("fetches a pod env var by sId", async () => {
    const { authenticator, secretVar } = await setupPodWithVars();

    const fetched = await PodSandboxEnvVarResource.fetchById(
      authenticator,
      secretVar.sId
    );
    expect(fetched?.name).toBe("API_TOKEN");
  });

  it("deletes a pod env var", async () => {
    const { authenticator, pod, secretVar } = await setupPodWithVars();

    const deleteResult = await secretVar.delete(authenticator);
    expect(deleteResult.isOk()).toBe(true);

    const listedAfterDelete = await PodSandboxEnvVarResource.listForPod(
      authenticator,
      pod
    );
    expect(listedAfterDelete.map((envVar) => envVar.name)).toEqual([
      "CONFIG_TOKEN",
    ]);
  });

  it("encrypts values at rest with the pod scope key and decrypts via loadEnv", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);

    const result = await PodSandboxEnvVarResource.makeNew(authenticator, pod, {
      name: "CONFIG_TOKEN",
      value: "config-value",
    });
    expect(result.isOk()).toBe(true);

    const row = await PodSandboxEnvVarModel.findOne({
      where: {
        workspaceId: authenticator.getNonNullableWorkspace().id,
        spaceId: pod.id,
        name: "CONFIG_TOKEN",
      },
    });
    expect(row?.encryptedValue).toBeDefined();
    expect(row?.encryptedValue).not.toBe("config-value");
    expect(row?.secretSourceKind).toBe("dust-managed");
    expect(row?.secretSourceConfig).toBeNull();

    const envResult = await PodSandboxEnvVarResource.loadEnv(
      authenticator,
      pod,
      { kind: "pod", spaceId: pod.sId }
    );
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({
      DST_CONFIG_TOKEN: "config-value",
    });
  });

  it("exposes DSEC placeholders for https secrets", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);

    const secretResult = await PodSandboxEnvVarResource.makeNew(
      authenticator,
      pod,
      {
        name: "API_TOKEN",
        kind: "https_secret",
        value: "api-secret",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(secretResult.isOk()).toBe(true);
    if (secretResult.isErr()) {
      throw secretResult.error;
    }

    const envResult =
      await PodSandboxEnvVarResource.loadHttpsSecretPlaceholderEnv(
        authenticator,
        pod,
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

  it("rejects duplicate names within a pod", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);

    const first = await PodSandboxEnvVarResource.makeNew(authenticator, pod, {
      name: "CONFIG_TOKEN",
      value: "config-value",
    });
    expect(first.isOk()).toBe(true);

    const second = await PodSandboxEnvVarResource.makeNew(authenticator, pod, {
      name: "CONFIG_TOKEN",
      value: "other-value",
    });
    expect(second.isErr()).toBe(true);

    // The failed create must not have touched the existing row's value.
    const envResult = await PodSandboxEnvVarResource.loadEnv(
      authenticator,
      pod,
      { kind: "pod", spaceId: pod.sId }
    );
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({ DST_CONFIG_TOKEN: "config-value" });
  });

  it("scopes rows to their pod", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const podA = await SpaceFactory.project(workspace, user.id);
    const podB = await SpaceFactory.project(workspace, user.id);

    const result = await PodSandboxEnvVarResource.makeNew(authenticator, podA, {
      name: "CONFIG_TOKEN",
      value: "config-value",
    });
    expect(result.isOk()).toBe(true);

    const listedForB = await PodSandboxEnvVarResource.listForPod(
      authenticator,
      podB
    );
    expect(listedForB).toEqual([]);
  });

  it("rejects non-pod spaces", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });

    await expect(
      PodSandboxEnvVarResource.makeNew(authenticator, globalSpace, {
        name: "CONFIG_TOKEN",
        value: "config-value",
      })
    ).rejects.toThrow("Only pod spaces can have sandbox environment variables");

    await expect(
      PodSandboxEnvVarResource.listForPod(authenticator, globalSpace)
    ).rejects.toThrow("Only pod spaces can have sandbox environment variables");
  });

  it("rejects loads for sandboxes not owned by the pod", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const podA = await SpaceFactory.project(workspace, user.id);
    const podB = await SpaceFactory.project(workspace, user.id);

    await expect(
      PodSandboxEnvVarResource.loadEnv(authenticator, podA, {
        kind: "pod",
        spaceId: podB.sId,
      })
    ).rejects.toThrow(
      "Pod env vars can only be loaded for pod-owned sandboxes"
    );

    await expect(
      PodSandboxEnvVarResource.loadHttpsSecretPlaceholderEnv(
        authenticator,
        podA,
        { kind: "conversation", conversationId: "conversation-test" }
      )
    ).rejects.toThrow(
      "Pod env vars can only be loaded for pod-owned sandboxes"
    );
  });

  it("upserts: updates the value in place and rejects kind transitions", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);

    const createResult = await PodSandboxEnvVarResource.upsert(
      authenticator,
      pod,
      {
        name: "CONFIG_TOKEN",
        value: "config-value",
      }
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }
    expect(createResult.value.created).toBe(true);

    const updateResult = await PodSandboxEnvVarResource.upsert(
      authenticator,
      pod,
      {
        name: "CONFIG_TOKEN",
        value: "rotated-value",
      }
    );
    expect(updateResult.isOk()).toBe(true);
    if (updateResult.isErr()) {
      throw updateResult.error;
    }
    expect(updateResult.value.created).toBe(false);

    const envResult = await PodSandboxEnvVarResource.loadEnv(
      authenticator,
      pod,
      { kind: "pod", spaceId: pod.sId }
    );
    expect(envResult.isOk()).toBe(true);
    if (envResult.isErr()) {
      throw envResult.error;
    }
    expect(envResult.value).toEqual({ DST_CONFIG_TOKEN: "rotated-value" });

    const kindTransitionResult = await PodSandboxEnvVarResource.upsert(
      authenticator,
      pod,
      {
        name: "CONFIG_TOKEN",
        kind: "https_secret",
        value: "secret-value",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(kindTransitionResult.isErr()).toBe(true);
  });

  it("promotes a config var to an https secret", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);

    const createResult = await PodSandboxEnvVarResource.makeNew(
      authenticator,
      pod,
      {
        name: "API_TOKEN",
        value: "api-secret",
      }
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }

    const promoteResult = await createResult.value.promoteToHttpsSecret(
      authenticator,
      pod,
      { allowedDomains: ["api.example.com"] }
    );
    expect(promoteResult.isOk()).toBe(true);
    if (promoteResult.isErr()) {
      throw promoteResult.error;
    }

    const fetched = await PodSandboxEnvVarResource.fetchById(
      authenticator,
      createResult.value.sId
    );
    expect(fetched?.kind).toBe("https_secret");
    expect(fetched?.placeholderNonce).not.toBeNull();
    expect(fetched?.allowedDomains).toEqual(["api.example.com"]);

    // A second promotion must reject: the row is no longer config.
    const rePromoteResult = await fetched?.promoteToHttpsSecret(
      authenticator,
      pod,
      { allowedDomains: ["api.example.com"] }
    );
    expect(rePromoteResult?.isErr()).toBe(true);
  });

  it("updates the value and allowed domains through the instance methods", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);

    const createResult = await PodSandboxEnvVarResource.makeNew(
      authenticator,
      pod,
      {
        name: "API_TOKEN",
        kind: "https_secret",
        value: "api-secret",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }
    const resource = createResult.value;

    const updateValueResult = await resource.updateValue(authenticator, pod, {
      value: "rotated-secret",
    });
    expect(updateValueResult.isOk()).toBe(true);

    const updateDomainsResult = await resource.updateAllowedDomains(
      authenticator,
      pod,
      { allowedDomains: ["other.example.com"] }
    );
    expect(updateDomainsResult.isOk()).toBe(true);

    const fetched = await PodSandboxEnvVarResource.fetchById(
      authenticator,
      resource.sId
    );
    expect(fetched?.allowedDomains).toEqual(["other.example.com"]);

    // The rotated value decrypts under the pod scope key — assert through
    // the real consumer, not just the placeholder env (which never touches
    // the ciphertext).
    const entriesResult = await buildPodEgressSecretEntries(
      authenticator,
      pod,
      { kind: "pod", spaceId: pod.sId }
    );
    expect(entriesResult.isOk()).toBe(true);
    if (entriesResult.isErr()) {
      throw entriesResult.error;
    }
    expect(entriesResult.value).toEqual([
      expect.objectContaining({
        name: "API_TOKEN",
        value: "rotated-secret",
        allowedDomains: ["other.example.com"],
      }),
    ]);

    // Mutating through a mismatched pod must trip the ownership assert
    // before any re-encryption happens.
    const otherPod = await SpaceFactory.project(workspace, user.id);
    await expect(
      resource.updateValue(authenticator, otherPod, { value: "nope" })
    ).rejects.toThrow(
      "Pod sandbox environment variable does not belong to this pod"
    );
  });
});
