import { ProviderCredentialModel } from "@app/lib/models/provider_credential";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";

export class ProviderCredentialFactory {
  static async basic(
    workspace: LightWorkspaceType,
    providerId: ByokModelProviderIdType = "openai",
    { isHealthy = true }: { isHealthy?: boolean } = {}
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
