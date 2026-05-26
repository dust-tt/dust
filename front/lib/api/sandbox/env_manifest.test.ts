import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

import {
  buildSandboxEnvManifest,
  SANDBOX_ENV_MANIFEST_PATH,
  writeSandboxEnvManifestFile,
} from "./env_manifest";

describe("sandbox environment manifest", () => {
  it("builds a deterministic manifest without any value field", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const zConfigResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "Z_CONFIG",
        value: "config-z",
      }
    );
    expect(zConfigResult.isOk()).toBe(true);

    const aConfigResult = await WorkspaceSandboxEnvVarResource.makeNew(
      authenticator,
      {
        name: "A_CONFIG",
        value: "config-a",
      }
    );
    expect(aConfigResult.isOk()).toBe(true);

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

    const manifestResult = await buildSandboxEnvManifest(authenticator);

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
          allowedDomains: ["api.example.com"],
        },
        {
          name: "DSEC_SLACK_TOKEN",
          allowedDomains: ["*.slack-edge.com", "slack.com"],
        },
      ],
    });

    const json = JSON.stringify(manifestResult.value);
    expect(json).not.toContain("config-a");
    expect(json).not.toContain("config-z");
    expect(json).not.toContain("api-secret");
    expect(json).not.toContain("slack-secret");
    expect(json).not.toContain("placeholder");
  });

  it("writes the manifest with mode 644 owned by root", async () => {
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
    if (secretResult.isErr()) {
      throw secretResult.error;
    }

    const sandbox = {
      exec: vi
        .fn()
        .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await writeSandboxEnvManifestFile(
      authenticator,
      sandbox as never
    );

    expect(result).toEqual(new Ok(undefined));
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
    const command = sandbox.exec.mock.calls[0][1] as string;
    const opts = sandbox.exec.mock.calls[0][2] as {
      stdin: string;
      user: string;
    };
    // Pin the exact install flags so a future drift to a tighter mode (or a
    // different owner) does not silently pass.
    expect(command).toMatch(/install -o root -g root -m 644 \/dev\/stdin/);
    expect(command).toContain(SANDBOX_ENV_MANIFEST_PATH);
    expect(command).not.toContain("api-secret");
    expect(opts.user).toBe("root");
    expect(JSON.stringify(JSON.parse(opts.stdin))).not.toContain("api-secret");
  });
});
