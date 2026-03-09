import { ProviderCredentialModel } from "@app/lib/models/provider_credential";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";

export class ProviderCredentialFactory {
  static async basic(
    workspace: LightWorkspaceType,
    providerId: ModelProviderIdType = "openai"
  ) {
    return ProviderCredentialModel.create({
      workspaceId: workspace.id,
      providerId,
      credentialId: `cred-${providerId}`,
      isHealthy: true,
      placeholder: "sk-...abc",
    });
  }
}
