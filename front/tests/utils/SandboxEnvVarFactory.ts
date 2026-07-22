import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceSandboxEnvVarModel } from "@app/lib/resources/storage/models/workspace_sandbox_env_var";
import type { WorkspaceSandboxEnvVarKind } from "@app/types/sandbox/env_var";

export class SandboxEnvVarFactory {
  // Writes the model directly on purpose: lets tests seed rows the
  // resource layer would refuse or cannot express, e.g. a raw
  // `encryptedValue` that is not valid ciphertext.
  static async create(
    auth: Authenticator,
    opts: {
      name: string;
      space?: SpaceResource;
      kind?: WorkspaceSandboxEnvVarKind;
      encryptedValue?: string;
    }
  ): Promise<WorkspaceSandboxEnvVarModel> {
    const user = auth.getNonNullableUser();

    return WorkspaceSandboxEnvVarModel.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      spaceId: opts.space?.id ?? null,
      name: opts.name,
      kind: opts.kind ?? "config",
      encryptedValue: opts.encryptedValue ?? "test-encrypted-value",
      createdByUserId: user.id,
      lastUpdatedByUserId: user.id,
    });
  }
}
