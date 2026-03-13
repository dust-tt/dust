import { ProviderCredentialModel } from "@app/lib/models/provider_credential";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";

export class ProviderCredentialFactory {
  static async basic(
    workspace: LightWorkspaceType,
    providerId: ByokModelProviderIdType = "openai"
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
