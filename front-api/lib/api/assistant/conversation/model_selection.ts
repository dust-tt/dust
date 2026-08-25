import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { getEnabledModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import { ModelSelectionSchema } from "@app/types/assistant/models/types";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { fromError } from "zod-validation-error";

export async function validatePublicModelSelection(
  auth: Authenticator,
  rawModelSelection: unknown
): Promise<
  Result<ModelSelectionType | undefined, APIErrorWithContentfulStatusCode>
> {
  if (!rawModelSelection) {
    return new Ok(undefined);
  }

  const parsed = ModelSelectionSchema.safeParse(rawModelSelection);
  if (!parsed.success) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid modelSelection: ${fromError(parsed.error).toString()}`,
      },
    });
  }
  const modelSelection = parsed.data;

  if (!(await hasFeatureFlag(auth, "models_picker"))) {
    return new Err({
      status_code: 403,
      api_error: {
        type: "feature_flag_not_found",
        message:
          "Per-message model selection requires the 'models_picker' feature, " +
          "which is not enabled for this workspace.",
      },
    });
  }

  const enabledModels = await getEnabledModelsForAuth(auth);
  const isAuthorized = enabledModels.some(
    (model) =>
      // Let it through so the message is created and the agent message carries
      // the "model unavailable" error instead.
      (model.isSelectable || model.isKilled) &&
      model.providerId === modelSelection.providerId &&
      model.modelId === modelSelection.modelId
  );
  if (!isAuthorized) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "model_disabled",
        message:
          `The selected model (${modelSelection.providerId}/${modelSelection.modelId}) ` +
          "is not authorized for this workspace.",
      },
    });
  }

  return new Ok(modelSelection);
}
