import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { decrypt } from "@app/types/shared/utils/encryption";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Provider-agnostic secret resolution seam for sandbox env vars.
//
// /!\ This union is a FROZEN contract. Future external-provider PRs add a
// `case` branch to `resolveSecretValue` only — they must not change the union
// arms or their field sets. If a provider implementation discovers a missing
// field here, that is a bug in this file, not a reason to extend the union
// ad hoc.
export type SecretSource =
  | { kind: "dust-managed" }
  | {
      kind: "onepassword-connect";
      connectServerUrl: string;
      accessToken: string;
      vaultId: string;
      itemId: string;
      // Stable field identifier (e.g. "password", "username", or a UUID for
      // custom fields). Labels are non-unique so they cannot be used for
      // lookup; `fieldLabel` is a display hint only.
      fieldId: string;
      fieldLabel?: string;
    }
  | {
      kind: "aws-secrets-manager";
      secretArn: string;
      region: string;
      // Optional cross-account IAM role to assume via STS.
      roleArn?: string;
      // Confused-deputy mitigation, required by most role trust policies.
      externalId?: string;
      // Defaults to "DustSandboxSecretFetch".
      roleSessionName?: string;
      // 900-43200, default 900 (one-shot fetch).
      durationSeconds?: number;
      // e.g. "AWSCURRENT" (default) or "AWSPREVIOUS".
      versionStage?: string;
      // Pin to a specific version UUID.
      versionId?: string;
    }
  | {
      kind: "vault";
      vaultUrl: string;
      appRoleId: string;
      appSecretId: string;
      mountPath: string;
      secretPath: string;
      // KV v2 returns a key→value map; this specifies which key to read.
      key: string;
      // X-Vault-Namespace header, required for Vault Enterprise / HCP Vault.
      namespace?: string;
    }
  | {
      kind: "gcp-secret-manager";
      // Accepts both a project ID string and a project number.
      projectId: string;
      secretName: string;
      serviceAccountKey: string;
      // Defaults to "latest"; set to pin a specific version.
      version?: string;
    };

export type SecretSourceKind = SecretSource["kind"];

// Builds a `SecretSource` from the persisted row fields. Only `dust-managed`
// is constructible today: external kinds need their (encrypted)
// `secretSourceConfig` deserialized, which is deferred to the provider
// implementation PRs — until then any non-dust-managed row resolves to the
// same "not yet implemented" error the resolver returns, and never to an
// empty value.
export function buildSecretSourceFromRow({
  secretSourceKind,
}: {
  secretSourceKind: string;
}): Result<SecretSource, Error> {
  if (secretSourceKind === "dust-managed") {
    return new Ok({ kind: "dust-managed" });
  }

  return new Err(
    new Error(`Secret source '${secretSourceKind}' is not yet implemented.`)
  );
}

// Resolves the cleartext value of a sandbox secret from its source.
// `encryptionKey` is the scope key the row was encrypted with (workspace sId
// for workspace rows, pod space sId for pod rows).
export async function resolveSecretValue(
  source: SecretSource,
  {
    encryptedValue,
    encryptionKey,
  }: { encryptedValue: string | null; encryptionKey: string }
): Promise<Result<string, Error>> {
  switch (source.kind) {
    case "dust-managed": {
      if (encryptedValue === null) {
        return new Err(
          new Error("dust-managed secret has no encrypted value.")
        );
      }

      try {
        return new Ok(
          decrypt({
            encrypted: encryptedValue,
            key: encryptionKey,
            useCase: "developer_secret",
          })
        );
      } catch (error) {
        return new Err(normalizeError(error));
      }
    }

    case "onepassword-connect":
    case "aws-secrets-manager":
    case "vault":
    case "gcp-secret-manager":
      return new Err(
        new Error(`Secret source '${source.kind}' is not yet implemented.`)
      );

    default:
      assertNever(source);
  }
}
