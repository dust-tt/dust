import { ProviderCredentialModel } from "@app/lib/models/provider_credential";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";

export class ProviderCredentialFactory {
  static async basic(
    workspace: LightWorkspaceType,
    providerId: ByokModelProviderIdType = "openai",
    { isHealthy } = { isHealthy: true }
  ) {
    return ProviderCredentialModel.create({
      workspaceId: workspace.id,
      providerId,
      credentialId: `cred-${providerId}`,
      isHealthy,
      placeholder: "sk-...abc",
    });
  }
}
