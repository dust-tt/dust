import { MODEL_TIER_ICON } from "@app/components/model_picker/modelPickerIcons";
import {
  buildTierSelection,
  getModelTier,
  getTierIdForModel,
  getTierLockReason,
} from "@app/components/model_picker/modelPickerUtils";
import { useCanSelectPremiumModels } from "@app/components/model_picker/useCanSelectPremiumModels";
import { useModels } from "@app/lib/swr/models";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import type {
  ModelResolutionMethodType,
  ModelSelectionType,
  ResolvedRequestedModel,
} from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";

// A message ran on a "pinned" model when it ran on a concrete model the user
// picked or the agent is configured with — as opposed to a stream, which is
// already an auto tier, or a fair-use downgrade, which the user did not choose.
function isPinnedResolution(method: ModelResolutionMethodType | null): boolean {
  return method === "user" || method === "agent";
}

interface RetryWithAutoTierButtonProps {
  owner: LightWorkspaceType;
  resolvedModel: ResolvedRequestedModel | null;
  modelResolutionMethod: ModelResolutionMethodType | null;
  disabled: boolean;
  onRetry: (selection: ModelSelectionType) => void;
}

// Offered on a failed message that ran on a pinned model — the user's own pick
// or the agent's configured model: re-runs it on the auto tier that model
// belongs to, so a model that is unavailable or throwing has a fallback that
// stays at a comparable capability and cost.
export function RetryWithAutoTierButton({
  owner,
  resolvedModel,
  modelResolutionMethod,
  disabled,
  onRetry,
}: RetryWithAutoTierButtonProps) {
  const lockPremiumEfforts = !useCanSelectPremiumModels();
  const { models } = useModels({ owner });

  const tierId =
    resolvedModel && isPinnedResolution(modelResolutionMethod)
      ? getTierIdForModel(resolvedModel.modelId, resolvedModel.reasoningEffort)
      : null;

  // An agent's configured model can sit above what its user is allowed to
  // select, so the tier it maps to is not necessarily within reach.
  const isLocked =
    tierId !== null &&
    getTierLockReason(tierId, {
      lockPremiumEfforts,
      streamModels: models.filter((model) => isModelStreamId(model.modelId)),
    }) !== null;

  if (!tierId || isLocked) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="xs"
      icon={MODEL_TIER_ICON[tierId]}
      label={`Retry with ${getModelTier(tierId).name}`}
      disabled={disabled}
      onClick={() => onRetry(buildTierSelection(tierId))}
    />
  );
}
