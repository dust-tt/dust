import type { Authenticator } from "@app/lib/auth";
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

  const enabledModels = await getEnabledModelsForAuth(auth);
  const isAuthorized = enabledModels.some(
    (model) =>
      model.isSelectable &&
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
