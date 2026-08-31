import type { RootCommand } from "@app/lib/api/sandbox/root_command";
import { renderRootCommand } from "@app/lib/api/sandbox/root_command";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

import {
  buildSandboxEnvManifest,
  SANDBOX_ENV_MANIFEST_PATH,
  writeSandboxEnvManifestFile,
} from "./env_manifest";

describe("sandbox environment manifest", () => {
  const conversationOwner = {
    kind: "conversation" as const,
    conversationId: "conversation-id",
    spaceId: null,
  };

  it("builds a deterministic manifest without any value field", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const zConfigResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "workspace", workspace: authenticator.getNonNullableWorkspace() },
      {
        name: "Z_CONFIG",
        value: "config-z",
      }
    );
    expect(zConfigResult.isOk()).toBe(true);

    const aConfigResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "workspace", workspace: authenticator.getNonNullableWorkspace() },
      {
        name: "A_CONFIG",
        value: "config-a",
      }
    );
    expect(aConfigResult.isOk()).toBe(true);

    const slackSecretResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "workspace", workspace: authenticator.getNonNullableWorkspace() },
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

    const apiSecretResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "workspace", workspace: authenticator.getNonNullableWorkspace() },
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

    const manifestResult = await buildSandboxEnvManifest(
      authenticator,
      conversationOwner
    );

    expect(manifestResult.isOk()).toBe(true);
    if (manifestResult.isErr()) {
      throw manifestResult.error;
    }

    // `toEqual` pins the manifest shape exhaustively: any extra field
    // (encryptedValue, value, etc.) would fail this assertion. The follow-up
    // `not.toContain` lines belt-and-suspenders the cleartext values that
    // were stored via makeNew so a future widening of the manifest shape
    // cannot silently start surfacing them.
    expect(manifestResult.value).toEqual({
      version: 1,
      system: [
        {
          name: "CONVERSATION_ID",
          description: "current conversation sId",
        },
        {
          name: "WORKSPACE_ID",
          description: "current workspace sId",
        },
      ],
      config: [{ name: "DST_A_CONFIG" }, { name: "DST_Z_CONFIG" }],
      httpsSecrets: [
        {
          name: "DSEC_API_TOKEN",
          placeholder: `__DSEC_${apiSecretResult.value.toJSON().placeholderNonce}__`,
          allowedDomains: ["api.example.com"],
        },
        {
          name: "DSEC_SLACK_TOKEN",
          placeholder: `__DSEC_${slackSecretResult.value.toJSON().placeholderNonce}__`,
          allowedDomains: ["*.slack-edge.com", "slack.com"],
        },
      ],
    });

    const json = JSON.stringify(manifestResult.value);
    expect(json).not.toContain("config-a");
    expect(json).not.toContain("config-z");
    expect(json).not.toContain("api-secret");
    expect(json).not.toContain("slack-secret");
  });

  it("uses SPACE_ID instead of CONVERSATION_ID for pod sandbox manifests", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);

    const manifestResult = await buildSandboxEnvManifest(authenticator, {
      kind: "pod",
      spaceId: pod.sId,
    });

    expect(manifestResult.isOk()).toBe(true);
    if (manifestResult.isErr()) {
      throw manifestResult.error;
    }

    expect(manifestResult.value.system).toEqual([
      {
        name: "SPACE_ID",
        description: "current pod space sId",
      },
      {
        name: "WORKSPACE_ID",
        description: "current workspace sId",
      },
    ]);
  });

  it("identifies Frame sandbox manifests with FRAME_ID", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const manifestResult = await buildSandboxEnvManifest(authenticator, {
      kind: "frame",
      frameId: "frame-id",
      spaceId: null,
    });

    expect(manifestResult.isOk()).toBe(true);
    if (manifestResult.isErr()) {
      throw manifestResult.error;
    }
    expect(manifestResult.value.system).toEqual([
      {
        name: "FRAME_ID",
        description: "current Frame sId",
      },
      {
        name: "WORKSPACE_ID",
        description: "current workspace sId",
      },
    ]);
  });

  it("lists pod vars (pod wins on collision) for sandboxes running in a pod", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);

    const workspaceVar = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "workspace", workspace },
      { name: "WORKSPACE_ONLY", value: "workspace-value" }
    );
    expect(workspaceVar.isOk()).toBe(true);

    const collidingSecret = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "workspace", workspace },
      {
        name: "SHARED_SECRET",
        kind: "https_secret",
        value: "workspace-secret",
        allowedDomains: ["workspace.example.com"],
      }
    );
    expect(collidingSecret.isOk()).toBe(true);

    const podSecret = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "pod", pod },
      {
        name: "SHARED_SECRET",
        kind: "https_secret",
        value: "pod-secret",
        allowedDomains: ["pod.example.com"],
      }
    );
    expect(podSecret.isOk()).toBe(true);
    if (podSecret.isErr()) {
      throw podSecret.error;
    }

    const podVar = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "pod", pod },
      { name: "POD_ONLY", value: "pod-value" }
    );
    expect(podVar.isOk()).toBe(true);

    // Same listing for the pod owner and a conversation running in the pod.
    for (const owner of [
      { kind: "pod" as const, spaceId: pod.sId },
      {
        kind: "conversation" as const,
        conversationId: "conversation-test",
        spaceId: pod.sId,
      },
    ]) {
      const manifestResult = await buildSandboxEnvManifest(
        authenticator,
        owner
      );
      expect(manifestResult.isOk()).toBe(true);
      if (manifestResult.isErr()) {
        throw manifestResult.error;
      }

      expect(manifestResult.value.config).toEqual([
        { name: "DST_POD_ONLY" },
        { name: "DST_WORKSPACE_ONLY" },
      ]);
      // Pod wins on collision: the pod row's placeholder and domains.
      expect(manifestResult.value.httpsSecrets).toEqual([
        {
          name: "DSEC_SHARED_SECRET",
          placeholder: `__DSEC_${podSecret.value.toJSON().placeholderNonce}__`,
          allowedDomains: ["pod.example.com"],
        },
      ]);
    }
  });

  it("rejects an HTTPS secret missing a placeholder nonce", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const secretResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "workspace", workspace: authenticator.getNonNullableWorkspace() },
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

    // Resource invariants prevent creating an https_secret row with a null
    // placeholderNonce, but the builder still defends against that DB
    // corruption case. Simulate it by overriding the instance attribute and
    // stubbing the resource list lookup, rather than reaching into the
    // Sequelize model from the test ([TEST5]).
    Object.defineProperty(secretResult.value, "placeholderNonce", {
      value: null,
      configurable: true,
    });
    vi.spyOn(SandboxEnvVarResource, "listForScope").mockResolvedValueOnce([
      secretResult.value,
    ]);

    const manifestResult = await buildSandboxEnvManifest(
      authenticator,
      conversationOwner
    );

    expect(manifestResult.isErr()).toBe(true);
    if (manifestResult.isErr()) {
      expect(manifestResult.error.message).toContain(
        "DSEC_API_TOKEN is missing its placeholder nonce"
      );
    }
  });

  it("writes the manifest with mode 644 owned by root", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const secretResult = await SandboxEnvVarResource.makeNew(
      authenticator,
      { kind: "workspace", workspace: authenticator.getNonNullableWorkspace() },
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

    const sandbox = {
      execRoot: vi
        .fn()
        .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await writeSandboxEnvManifestFile(
      authenticator,
      sandbox as never,
      conversationOwner
    );

    expect(result).toEqual(new Ok(undefined));
    expect(sandbox.execRoot).toHaveBeenCalledTimes(1);
    const command = renderRootCommand(
      sandbox.execRoot.mock.calls[0][1] as RootCommand
    );
    const opts = sandbox.execRoot.mock.calls[0][2] as {
      stdin: string;
    };
    // Pin the exact install flags so a future drift to a tighter mode (or a
    // different owner) does not silently pass.
    expect(command).toMatch(
      /\/usr\/bin\/install -o root -g root -m 644 \/dev\/stdin/
    );
    expect(command).toContain(SANDBOX_ENV_MANIFEST_PATH);
    expect(command).not.toContain("api-secret");
    expect(JSON.stringify(JSON.parse(opts.stdin))).not.toContain("api-secret");
  });
});
