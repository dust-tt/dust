import type { Authenticator } from "@app/lib/auth";
import { getEnabledModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import { ModelSelectionSchema } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { fromError } from "zod-validation-error";

export class ModelSelectionError extends Error {
  constructor(
    readonly code: "invalid_model_selection" | "model_disabled",
    message: string
  ) {
    super(message);
  }
}

export async function validatePublicModelSelection(
  auth: Authenticator,
  rawModelSelection: unknown
): Promise<Result<ModelSelectionType | undefined, ModelSelectionError>> {
  if (!rawModelSelection) {
    return new Ok(undefined);
  }

  const parsed = ModelSelectionSchema.safeParse(rawModelSelection);
  if (!parsed.success) {
    return new Err(
      new ModelSelectionError(
        "invalid_model_selection",
        `Invalid modelSelection: ${fromError(parsed.error).toString()}`
      )
    );
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
    return new Err(
      new ModelSelectionError(
        "model_disabled",
        `The selected model (${modelSelection.providerId}/${modelSelection.modelId}) ` +
          "is not authorized for this workspace."
      )
    );
  }

  return new Ok(modelSelection);
}
