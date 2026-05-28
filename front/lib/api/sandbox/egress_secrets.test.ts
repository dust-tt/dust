import {
  type RootCommand,
  renderRootCommand,
} from "@app/lib/api/sandbox/root_command";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

import {
  buildEgressSecretFileEntries,
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
      sandbox as never
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
});
