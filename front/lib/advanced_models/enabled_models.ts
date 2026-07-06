import { advancedModelKey } from "@app/lib/advanced_models/resolve_allowed";
import { isAdvancedModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AdvancedModelResource } from "@app/lib/resources/advanced_model_resource";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export async function withModelSelectability(
  auth: Authenticator,
  { models }: { models: ModelConfigurationType[] }
): Promise<EnabledModelConfigurationType[]> {
  const featureFlags = await getFeatureFlags(auth);

  if (!featureFlags.includes("models_picker")) {
    return models.map((model) => ({
      ...model,
      isSelectable: true,
    }));
  }

  const { models: allowedAdvancedModels } =
    await AdvancedModelResource.resolveAllowedAdvancedModels(auth, {
      user: auth.user(),
    });

  const allowedAdvancedModelKeys = new Set(
    allowedAdvancedModels.map(advancedModelKey)
  );

  return models.map((model) => ({
    ...model,
    isSelectable:
      !isAdvancedModel(model) ||
      allowedAdvancedModelKeys.has(advancedModelKey(model)),
  }));
}
