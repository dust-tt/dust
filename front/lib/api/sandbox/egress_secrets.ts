import { randomBytes } from "node:crypto";

import { renderEgressSecretPlaceholder } from "@app/lib/api/sandbox/env_vars";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { decrypt } from "@app/types/shared/utils/encryption";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export const EGRESS_SECRETS_PATH = "/run/dust/egress-secrets.json";

const EGRESS_SECRETS_DIR = "/run/dust";

export type EgressSecretFileEntry = {
  // Bare workspace-row name (no DSEC_ prefix). dsbx pairs this with the
  // placeholder when scanning outbound HTTPS bodies.
  name: string;
  placeholder: string;
  value: string;
  allowedDomains: string[];
};

export async function buildEgressSecretFileEntries(
  auth: Authenticator
): Promise<Result<EgressSecretFileEntry[], Error>> {
  const owner = auth.getNonNullableWorkspace();
  const resources =
    await WorkspaceSandboxEnvVarResource.listHttpsSecretsForEgress(auth);

  const entries: EgressSecretFileEntry[] = [];
  for (const resource of resources) {
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

    let value: string;
    try {
      value = decrypt({
        encrypted: resource.encryptedValue,
        key: owner.sId,
        useCase: "developer_secret",
      });
    } catch (error) {
      return new Err(
        new Error(
          `Failed to decrypt sandbox HTTPS secret ${resource.envName}: ${
            normalizeError(error).message
          }`
        )
      );
    }

    entries.push({
      name: resource.name,
      placeholder: renderEgressSecretPlaceholder(resource.placeholderNonce),
      value,
      allowedDomains: Array.from(resource.allowedDomains),
    });
  }

  return new Ok(entries);
}

export async function writeEgressSecretsFile(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<void, Error>> {
  const entriesResult = await buildEgressSecretFileEntries(auth);
  if (entriesResult.isErr()) {
    return entriesResult;
  }

  // /run/dust is created by dsbx (for egress-ca.{pem,key}) before front ever
  // writes here in a healthy sandbox; the mkdir -p covers cold-start ordering
  // (front beats dsbx) without changing perms on a directory dsbx may have
  // hardened. install -m 600 sets the file's perms; the directory's perms are
  // dsbx's call.
  const tmpPath = `${EGRESS_SECRETS_DIR}/.egress-secrets.json.${randomBytes(8).toString("hex")}.tmp`;
  const command =
    `/usr/bin/mkdir -p ${shellEscape(EGRESS_SECRETS_DIR)} && ` +
    `/usr/bin/install -o root -g root -m 600 /dev/stdin ${shellEscape(tmpPath)} && ` +
    `/usr/bin/mv ${shellEscape(tmpPath)} ${shellEscape(EGRESS_SECRETS_PATH)}`;

  const result = await sandbox.exec(auth, command, {
    stdin: JSON.stringify(entriesResult.value),
    user: "root",
  });
  if (result.isErr()) {
    return result;
  }
  if (result.value.exitCode !== 0) {
    return new Err(
      new Error(
        `Failed to write sandbox egress secrets file: ${
          result.value.stderr || result.value.stdout || "unknown error"
        }`
      )
    );
  }

  return new Ok(undefined);
}
