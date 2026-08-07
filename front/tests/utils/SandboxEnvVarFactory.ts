import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { SandboxEnvVarModel } from "@app/lib/resources/storage/models/sandbox_env_var";
import type { SandboxEnvVarKind } from "@app/types/sandbox/env_var";

export class SandboxEnvVarFactory {
  // Writes the model directly on purpose: lets tests seed rows the
  // resource layer would refuse or cannot express, e.g. a raw
  // `encryptedValue` that is not valid ciphertext.
  static async create(
    auth: Authenticator,
    opts: {
      name: string;
      space?: SpaceResource;
      kind?: SandboxEnvVarKind;
      encryptedValue?: string;
      placeholderNonce?: Buffer;
      allowedDomains?: string[];
    }
  ): Promise<SandboxEnvVarModel> {
    const user = auth.getNonNullableUser();

    return SandboxEnvVarModel.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      spaceId: opts.space?.id ?? null,
      name: opts.name,
      kind: opts.kind ?? "config",
      encryptedValue: opts.encryptedValue ?? "test-encrypted-value",
      placeholderNonce: opts.placeholderNonce ?? null,
      allowedDomains: opts.allowedDomains ?? null,
      createdByUserId: user.id,
      lastUpdatedByUserId: user.id,
    });
  }
}
