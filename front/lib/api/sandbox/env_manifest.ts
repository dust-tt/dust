import { randomBytes } from "node:crypto";

import { renderEgressSecretPlaceholder } from "@app/lib/api/sandbox/env_vars";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { Err, Ok, type Result } from "@app/types/shared/result";

export const SANDBOX_ENV_MANIFEST_PATH = "/run/dust/sandbox-env-manifest.json";

const SANDBOX_ENV_MANIFEST_DIR = "/run/dust";

// /!\ This manifest is written mode 644 and is readable by the non-root
// agent-proxied user inside the sandbox. NEVER add a value, encryptedValue,
// or any field derived from a decrypted secret to these shapes. Names,
// placeholders, and allowed-domain patterns ONLY.
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
  return entries.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export async function buildSandboxEnvManifest(
  auth: Authenticator
): Promise<Result<SandboxEnvManifest, Error>> {
  const allVars = await WorkspaceSandboxEnvVarResource.listForWorkspace(auth);

  const httpsSecrets: SandboxEnvManifest["httpsSecrets"] = [];
  for (const resource of allVars) {
    if (resource.kind !== "https_secret") {
      continue;
    }
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
      allVars
        .filter((resource) => resource.kind === "config")
        .map((resource) => ({ name: resource.envName }))
    ),
    httpsSecrets: sortByName(httpsSecrets),
  });
}

export async function writeSandboxEnvManifestFile(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  const manifestResult = await buildSandboxEnvManifest(auth);
  if (manifestResult.isErr()) {
    return manifestResult;
  }

  const tmpPath = `${SANDBOX_ENV_MANIFEST_DIR}/.sandbox-env-manifest.json.${randomBytes(8).toString("hex")}.tmp`;
  const command =
    `/usr/bin/mkdir -p ${shellEscape(SANDBOX_ENV_MANIFEST_DIR)} && ` +
    `/usr/bin/install -o root -g root -m 644 /dev/stdin ${shellEscape(tmpPath)} && ` +
    `/usr/bin/mv ${shellEscape(tmpPath)} ${shellEscape(SANDBOX_ENV_MANIFEST_PATH)}`;

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
