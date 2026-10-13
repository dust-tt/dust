import type { Authenticator } from "@app/lib/auth";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";

export class DustAppSecretFactory {
  // Writes the model directly so tests control the raw encrypted `hash`.
  static async create(
    auth: Authenticator,
    opts: {
      name: string;
      hash: string;
    }
  ): Promise<DustAppSecretModel> {
    return DustAppSecretModel.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      userId: auth.getNonNullableUser().id,
      name: opts.name,
      hash: opts.hash,
    });
  }
}
