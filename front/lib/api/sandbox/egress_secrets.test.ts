import {
  type RootCommand,
  renderRootCommand,
} from "@app/lib/api/sandbox/root_command";
import { PodSandboxEnvVarResource } from "@app/lib/resources/pod_sandbox_env_var_resource";
import { PodSandboxEnvVarModel } from "@app/lib/resources/storage/models/pod_sandbox_env_var";
import { WorkspaceSandboxEnvVarModel } from "@app/lib/resources/storage/models/workspace_sandbox_env_var";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

import {
  buildEgressSecretFileEntries,
  buildEgressSecretFileEntriesForOwner,
  buildPodEgressSecretEntries,
  writeEgressSecretsFile,
} from "./egress_secrets";

describe("egress secrets file", () => {
  it("builds the dsbx secrets JSON entries from HTTPS secrets only", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const configResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "CONFIG_TOKEN",
        value: "config-token",
      }
    );
    expect(configResult.isOk()).toBe(true);

    const apiSecretResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "API_TOKEN",
        kind: "https_secret",
        value: "api-secret",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(apiSecretResult.isOk()).toBe(true);
    if (apiSecretResult.isErr()) {
      throw apiSecretResult.error;
    }

    const slackSecretResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "SLACK_TOKEN",
        kind: "https_secret",
        value: "slack-secret",
        allowedDomains: ["slack.com", "*.slack-edge.com"],
      }
    );
    expect(slackSecretResult.isOk()).toBe(true);
    if (slackSecretResult.isErr()) {
      throw slackSecretResult.error;
    }

    const entriesResult = await buildEgressSecretFileEntries(authenticator);
    expect(entriesResult.isOk()).toBe(true);
    if (entriesResult.isErr()) {
      throw entriesResult.error;
    }

    expect(entriesResult.value).toEqual([
      {
        name: "API_TOKEN",
        placeholder: `__DSEC_${apiSecretResult.value.toJSON().placeholderNonce}__`,
        value: "api-secret",
        allowedDomains: ["api.example.com"],
      },
      {
        name: "SLACK_TOKEN",
        placeholder: `__DSEC_${slackSecretResult.value.toJSON().placeholderNonce}__`,
        value: "slack-secret",
        allowedDomains: ["slack.com", "*.slack-edge.com"],
      },
    ]);
  });

  it("writes the secrets file through stdin without putting values in argv", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const secretResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "API_TOKEN",
        kind: "https_secret",
        value: "api-secret",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(secretResult.isOk()).toBe(true);

    const sandbox = {
      execRoot: vi
        .fn()
        .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await writeEgressSecretsFile(
      authenticator,
      sandbox as never,
      { kind: "conversation", conversationId: "conversation-test" }
    );

    expect(result).toEqual(new Ok(undefined));
    expect(sandbox.execRoot).toHaveBeenCalledTimes(1);
    const command = renderRootCommand(
      sandbox.execRoot.mock.calls[0][1] as RootCommand
    );
    const opts = sandbox.execRoot.mock.calls[0][2] as {
      stdin: string;
    };
    expect(command).toContain(
      "/usr/bin/install -o root -g root -m 600 /dev/stdin"
    );
    expect(command).toContain("/run/dust/egress-secrets.json");
    expect(command).not.toContain("api-secret");
    expect(JSON.parse(opts.stdin)).toEqual([
      expect.objectContaining({
        name: "API_TOKEN",
        value: "api-secret",
        allowedDomains: ["api.example.com"],
      }),
    ]);
  });

  it("returns workspace entries unchanged for conversation-owned sandboxes", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const secretResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "API_TOKEN",
        kind: "https_secret",
        value: "api-secret",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(secretResult.isOk()).toBe(true);

    const entriesResult = await buildEgressSecretFileEntriesForOwner(
      authenticator,
      { kind: "conversation", conversationId: "conversation-test" }
    );
    expect(entriesResult.isOk()).toBe(true);
    if (entriesResult.isErr()) {
      throw entriesResult.error;
    }
    expect(entriesResult.value).toEqual([
      expect.objectContaining({ name: "API_TOKEN", value: "api-secret" }),
    ]);
  });

  it("merges pod entries over workspace entries for pod-owned sandboxes", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);

    const workspaceSharedResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "SHARED_TOKEN",
        kind: "https_secret",
        value: "workspace-secret",
        allowedDomains: ["workspace.example.com"],
      }
    );
    expect(workspaceSharedResult.isOk()).toBe(true);

    const workspaceOnlyResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "WORKSPACE_ONLY_TOKEN",
        kind: "https_secret",
        value: "workspace-only-secret",
        allowedDomains: ["workspace.example.com"],
      }
    );
    expect(workspaceOnlyResult.isOk()).toBe(true);

    const podSharedResult = await PodSandboxEnvVarResource.makeNew(
      authenticator,
      pod,
      {
        name: "SHARED_TOKEN",
        kind: "https_secret",
        value: "pod-secret",
        allowedDomains: ["pod.example.com"],
      }
    );
    expect(podSharedResult.isOk()).toBe(true);
    if (podSharedResult.isErr()) {
      throw podSharedResult.error;
    }

    const podOnlyResult = await PodSandboxEnvVarResource.makeNew(
      authenticator,
      pod,
      {
        name: "POD_ONLY_TOKEN",
        kind: "https_secret",
        value: "pod-only-secret",
        allowedDomains: ["pod.example.com"],
      }
    );
    expect(podOnlyResult.isOk()).toBe(true);

    const entriesResult = await buildEgressSecretFileEntriesForOwner(
      authenticator,
      { kind: "pod", spaceId: pod.sId }
    );
    expect(entriesResult.isOk()).toBe(true);
    if (entriesResult.isErr()) {
      throw entriesResult.error;
    }

    const entriesByName = new Map(
      entriesResult.value.map((entry) => [entry.name, entry])
    );
    expect(entriesByName.size).toBe(3);

    // Pod wins on name collision, including placeholder and domains.
    expect(entriesByName.get("SHARED_TOKEN")).toEqual({
      name: "SHARED_TOKEN",
      placeholder: `__DSEC_${podSharedResult.value.toJSON().placeholderNonce}__`,
      value: "pod-secret",
      allowedDomains: ["pod.example.com"],
    });
    expect(entriesByName.get("WORKSPACE_ONLY_TOKEN")).toEqual(
      expect.objectContaining({ value: "workspace-only-secret" })
    );
    expect(entriesByName.get("POD_ONLY_TOKEN")).toEqual(
      expect.objectContaining({ value: "pod-only-secret" })
    );
  });

  it("builds pod entries with values decrypted under the pod scope key", async () => {
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
        value: "pod-api-secret",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(secretResult.isOk()).toBe(true);
    if (secretResult.isErr()) {
      throw secretResult.error;
    }

    const entriesResult = await buildPodEgressSecretEntries(
      authenticator,
      pod,
      {
        kind: "pod",
        spaceId: pod.sId,
      }
    );
    expect(entriesResult.isOk()).toBe(true);
    if (entriesResult.isErr()) {
      throw entriesResult.error;
    }
    expect(entriesResult.value).toEqual([
      {
        name: "API_TOKEN",
        placeholder: `__DSEC_${secretResult.value.toJSON().placeholderNonce}__`,
        value: "pod-api-secret",
        allowedDomains: ["api.example.com"],
      },
    ]);
  });

  it("fails the whole build when a pod row has a non-dust-managed source", async () => {
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
        value: "pod-api-secret",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(secretResult.isOk()).toBe(true);
    if (secretResult.isErr()) {
      throw secretResult.error;
    }

    // Simulate a row written by a future external-provider version: the
    // current code must error out, never emit an empty value.
    await PodSandboxEnvVarModel.update(
      { secretSourceKind: "vault" },
      {
        where: {
          workspaceId: authenticator.getNonNullableWorkspace().id,
          spaceId: pod.id,
          name: "API_TOKEN",
        },
      }
    );

    const entriesResult = await buildPodEgressSecretEntries(
      authenticator,
      pod,
      {
        kind: "pod",
        spaceId: pod.sId,
      }
    );
    expect(entriesResult.isErr()).toBe(true);
    if (entriesResult.isOk()) {
      throw new Error("Expected an error.");
    }
    expect(entriesResult.error.message).toContain("not yet implemented");
  });

  it("fails the whole build when a workspace row has a non-dust-managed source", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const secretResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "API_TOKEN",
        kind: "https_secret",
        value: "api-secret",
        allowedDomains: ["api.example.com"],
      }
    );
    expect(secretResult.isOk()).toBe(true);

    // Simulate a row written by a future external-provider version: the
    // current code must error out, never emit an empty value.
    await WorkspaceSandboxEnvVarModel.update(
      { secretSourceKind: "vault" },
      {
        where: {
          workspaceId: authenticator.getNonNullableWorkspace().id,
          name: "API_TOKEN",
        },
      }
    );

    const entriesResult = await buildEgressSecretFileEntries(authenticator);
    expect(entriesResult.isErr()).toBe(true);
    if (entriesResult.isOk()) {
      throw new Error("Expected an error.");
    }
    expect(entriesResult.error.message).toContain("not yet implemented");
  });
});
