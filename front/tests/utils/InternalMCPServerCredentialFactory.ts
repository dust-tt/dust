import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerCredentialModel } from "@app/lib/models/agent/actions/internal_mcp_server_credentials";

export class InternalMCPServerCredentialFactory {
  // Writes the model directly so tests control the raw `encryptedKey`.
  static async create(
    auth: Authenticator,
    opts: {
      internalMCPServerId: string;
      encryptedKey?: string | null;
      customHeaders?: Record<string, string> | null;
    }
  ): Promise<InternalMCPServerCredentialModel> {
    return InternalMCPServerCredentialModel.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      internalMCPServerId: opts.internalMCPServerId,
      sharedSecret: null,
      customHeaders: opts.customHeaders ?? null,
      encryptedKey: opts.encryptedKey ?? null,
    });
  }
}
