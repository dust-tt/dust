import { randomBytes } from "node:crypto";

import { renderEgressSecretPlaceholder } from "@app/lib/api/sandbox/env_vars";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Err, Ok, type Result } from "@app/types/shared/result";

export const SANDBOX_ENV_MANIFEST_PATH = "/run/dust/sandbox-env-manifest.json";

const SANDBOX_ENV_MANIFEST_DIR = "/run/dust";

export type SandboxEnvManifest = {
  version: 1;
  system: { name: string; description: string }[];
  config: { name: string }[];
  httpsSecrets: {
    name: string;
    placeholder: string;
    allowedDomains: string[];
  }[];
};

function sortByName<T extends { name: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );
}

export async function buildSandboxEnvManifest(
  auth: Authenticator,
  conversation: ConversationType
): Promise<Result<SandboxEnvManifest, Error>> {
  // Values are intentionally omitted; the conversation argument keeps this
  // builder aligned with the system vars set by SandboxResource.
  void conversation;

  const workspaceEnvVars =
    await WorkspaceSandboxEnvVarResource.listForWorkspace(auth);
  const httpsSecretResources =
    await WorkspaceSandboxEnvVarResource.listHttpsSecretsForEgress(auth);

  const httpsSecrets: SandboxEnvManifest["httpsSecrets"] = [];
  for (const resource of httpsSecretResources) {
    if (!resource.placeholderNonce) {
      return new Err(
        new Error(
          `HTTPS secret sandbox environment variable ${resource.envName} is missing its placeholder nonce.`
        )
      );
    }
    if (!resource.allowedDomains) {
      return new Err(
        new Error(
          `HTTPS secret sandbox environment variable ${resource.envName} is missing allowed domains.`
        )
      );
    }

    httpsSecrets.push({
      name: resource.envName,
      placeholder: renderEgressSecretPlaceholder(resource.placeholderNonce),
      allowedDomains: [...resource.allowedDomains].sort(),
    });
  }

  return new Ok({
    version: 1,
    system: sortByName([
      {
        name: "CONVERSATION_ID",
        description: "current conversation sId",
      },
      {
        name: "WORKSPACE_ID",
        description: "current workspace sId",
      },
    ]),
    config: sortByName(
      workspaceEnvVars
        .filter((resource) => resource.kind === "config")
        .map((resource) => ({ name: resource.envName }))
    ),
    httpsSecrets: sortByName(httpsSecrets),
  });
}

export async function writeSandboxEnvManifestFile(
  auth: Authenticator,
  sandbox: SandboxResource,
  conversation: ConversationType
): Promise<Result<void, Error>> {
  const manifestResult = await buildSandboxEnvManifest(auth, conversation);
  if (manifestResult.isErr()) {
    return manifestResult;
  }

  const tmpPath = `${SANDBOX_ENV_MANIFEST_DIR}/.sandbox-env-manifest.json.${randomBytes(8).toString("hex")}.tmp`;
  const command =
    `mkdir -p ${shellEscape(SANDBOX_ENV_MANIFEST_DIR)} && ` +
    `install -o root -g root -m 644 /dev/stdin ${shellEscape(tmpPath)} && ` +
    `mv ${shellEscape(tmpPath)} ${shellEscape(SANDBOX_ENV_MANIFEST_PATH)}`;

  const result = await sandbox.exec(auth, command, {
    stdin: JSON.stringify(manifestResult.value),
    user: "root",
  });
  if (result.isErr()) {
    return result;
  }
  if (result.value.exitCode !== 0) {
    return new Err(
      new Error(
        `Failed to write sandbox environment manifest file: ${
          result.value.stderr || result.value.stdout || "unknown error"
        }`
      )
    );
  }

  return new Ok(undefined);
}
