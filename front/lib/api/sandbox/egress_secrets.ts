import { randomBytes } from "node:crypto";

import { renderEgressSecretPlaceholder } from "@app/lib/api/sandbox/env_vars";
import type { SandboxRuntimeOwner } from "@app/lib/api/sandbox/owner";
import { rootCommand } from "@app/lib/api/sandbox/root_command";
import {
  buildSecretSourceFromRow,
  resolveSecretValue,
} from "@app/lib/api/sandbox/secret_source";
import type { Authenticator } from "@app/lib/auth";
import { PodSandboxEnvVarResource } from "@app/lib/resources/pod_sandbox_env_var_resource";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceSandboxEnvVarResource } from "@app/lib/resources/workspace_sandbox_env_var_resource";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

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

    // Workspace rows predate secret sources and are all dust-managed.
    const valueResult = await resolveSecretValue(
      { kind: "dust-managed" },
      {
        encryptedValue: resource.encryptedValue,
        encryptionKey: owner.sId,
      }
    );
    if (valueResult.isErr()) {
      return new Err(
        new Error(
          `Failed to resolve sandbox HTTPS secret ${resource.envName}: ${valueResult.error.message}`
        )
      );
    }

    entries.push({
      name: resource.name,
      placeholder: renderEgressSecretPlaceholder(resource.placeholderNonce),
      value: valueResult.value,
      allowedDomains: Array.from(resource.allowedDomains),
    });
  }

  return new Ok(entries);
}

export async function buildPodEgressSecretEntries(
  auth: Authenticator,
  pod: SpaceResource
): Promise<Result<EgressSecretFileEntry[], Error>> {
  const resources = await PodSandboxEnvVarResource.listHttpsSecretsForEgress(
    auth,
    pod
  );

  const entries: EgressSecretFileEntry[] = [];
  for (const resource of resources) {
    if (!resource.placeholderNonce) {
      return new Err(
        new Error(
          `Pod HTTPS secret sandbox environment variable ${resource.envName} is missing its placeholder nonce.`
        )
      );
    }
    if (!resource.allowedDomains) {
      return new Err(
        new Error(
          `Pod HTTPS secret sandbox environment variable ${resource.envName} is missing allowed domains.`
        )
      );
    }

    const sourceResult = buildSecretSourceFromRow({
      secretSourceKind: resource.secretSourceKind,
    });
    if (sourceResult.isErr()) {
      return new Err(
        new Error(
          `Failed to resolve pod sandbox HTTPS secret ${resource.envName}: ${sourceResult.error.message}`
        )
      );
    }

    const valueResult = await resolveSecretValue(sourceResult.value, {
      encryptedValue: resource.encryptedValue,
      encryptionKey: pod.sId,
    });
    if (valueResult.isErr()) {
      return new Err(
        new Error(
          `Failed to resolve pod sandbox HTTPS secret ${resource.envName}: ${valueResult.error.message}`
        )
      );
    }

    entries.push({
      name: resource.name,
      placeholder: renderEgressSecretPlaceholder(resource.placeholderNonce),
      value: valueResult.value,
      allowedDomains: Array.from(resource.allowedDomains),
    });
  }

  return new Ok(entries);
}

// Pod entries shadow workspace entries of the same name, mirroring the env
// injection precedence (owner env layer beats the workspace layer).
export function mergeEgressSecretFileEntries({
  workspaceEntries,
  podEntries,
}: {
  workspaceEntries: EgressSecretFileEntry[];
  podEntries: EgressSecretFileEntry[];
}): EgressSecretFileEntry[] {
  const byName = new Map(workspaceEntries.map((entry) => [entry.name, entry]));
  for (const entry of podEntries) {
    byName.set(entry.name, entry);
  }
  return [...byName.values()];
}

// Builds the full entry set for a sandbox given its runtime owner: workspace
// entries for every sandbox, plus pod entries (pod wins on name collision)
// for pod-owned sandboxes. Any resolution failure aborts the whole build —
// we never write a partial or empty-valued entry.
export async function buildEgressSecretFileEntriesForOwner(
  auth: Authenticator,
  runtimeOwner: SandboxRuntimeOwner
): Promise<Result<EgressSecretFileEntry[], Error>> {
  const workspaceEntriesResult = await buildEgressSecretFileEntries(auth);
  if (workspaceEntriesResult.isErr()) {
    return workspaceEntriesResult;
  }

  switch (runtimeOwner.kind) {
    case "conversation":
      return workspaceEntriesResult;

    case "pod": {
      const pod = await SpaceResource.fetchById(auth, runtimeOwner.spaceId);
      if (!pod || !pod.isProject()) {
        return new Err(
          new Error(
            `Pod space ${runtimeOwner.spaceId} not found while building sandbox egress secrets.`
          )
        );
      }

      const podEntriesResult = await buildPodEgressSecretEntries(auth, pod);
      if (podEntriesResult.isErr()) {
        return podEntriesResult;
      }

      return new Ok(
        mergeEgressSecretFileEntries({
          workspaceEntries: workspaceEntriesResult.value,
          podEntries: podEntriesResult.value,
        })
      );
    }

    default:
      assertNever(runtimeOwner);
  }
}

export async function writeEgressSecretsFile(
  auth: Authenticator,
  sandbox: SandboxResource,
  runtimeOwner: SandboxRuntimeOwner
): Promise<Result<void, Error>> {
  const entriesResult = await buildEgressSecretFileEntriesForOwner(
    auth,
    runtimeOwner
  );
  if (entriesResult.isErr()) {
    return entriesResult;
  }

  // /run/dust is created by dsbx (for egress-ca.{pem,key}) before front ever
  // writes here in a healthy sandbox; the mkdir -p covers cold-start ordering
  // (front beats dsbx) without changing perms on a directory dsbx may have
  // hardened. install -m 600 sets the file's perms; the directory's perms are
  // dsbx's call.
  const tmpPath = `${EGRESS_SECRETS_DIR}/.egress-secrets.json.${randomBytes(8).toString("hex")}.tmp`;
  const command = rootCommand.and([
    rootCommand.exec("/usr/bin/mkdir", ["-p", EGRESS_SECRETS_DIR]),
    rootCommand.exec("/usr/bin/install", [
      "-o",
      "root",
      "-g",
      "root",
      "-m",
      "600",
      "/dev/stdin",
      tmpPath,
    ]),
    rootCommand.exec("/usr/bin/mv", [tmpPath, EGRESS_SECRETS_PATH]),
  ]);

  const result = await sandbox.execRoot(auth, command, {
    stdin: JSON.stringify(entriesResult.value),
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
