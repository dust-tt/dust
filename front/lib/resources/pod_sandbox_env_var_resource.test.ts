import { PodSandboxEnvVarResource } from "@app/lib/resources/pod_sandbox_env_var_resource";
import { PodSandboxEnvVarModel } from "@app/lib/resources/storage/models/pod_sandbox_env_var";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { describe, expect, it } from "vitest";

describe("PodSandboxEnvVarResource", () => {
  it("creates, lists and deletes pod env vars", async () => {
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
    expect(configResult.isOk()).toBe(true);
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
    expect(secretResult.isOk()).toBe(true);
    if (secretResult.isErr()) {
      throw secretResult.error;
    }

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
      }),
      expect.objectContaining({
        name: "DST_CONFIG_TOKEN",
        kind: "config",
        placeholderNonce: null,
        allowedDomains: null,
        secretSourceKind: "dust-managed",
      }),
    ]);
    expect(
      JSON.stringify(listed.map((envVar) => envVar.toJSON()))
    ).not.toContain("api-secret");

    const fetched = await PodSandboxEnvVarResource.fetchById(
      authenticator,
      secretResult.value.sId
    );
    expect(fetched?.name).toBe("API_TOKEN");

    const deleteResult = await secretResult.value.delete(authenticator);
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
      pod
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
        pod
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
});
