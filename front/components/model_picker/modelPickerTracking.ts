import type { SelectionDisplay } from "@app/components/model_picker/modelPickerUtils";
import type { ClientType } from "@app/lib/context/clientType";
import type { TrackingExtra } from "@app/lib/tracking";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

// PostHog instrumentation for the model picker. All events share the
// `assistant:model_picker:<action>` name (see `trackEvent`, which builds
// `${area}:${object}:${action}`) and a common set of properties: the surface
// the picker is rendered on, the discovery-campaign id, and the client type.
//
// Only surfaces that pass a `ModelPickerSurface` are instrumented. Today that
// is the conversation input bar; the agent-builder embedding does not pass a
// surface and is intentionally left untracked.

const TRACKING_OBJECT = "model_picker";

// Identifies the model-picker discovery/highlight campaign (see
// `ModelPickerHighlight`, which time-boxes the glint). Bump this when a new
// campaign starts so events can be segmented per campaign.
export const MODEL_PICKER_CAMPAIGN_ID = "model_picker_launch_2026_08";

// Where the picker is rendered. Extend this union when a new surface starts
// passing a `trackingSurface` to `ModelPicker`.
export type ModelPickerSurface = "conversation_input_bar";

// What triggered a `select` event, mirroring the picker's four intentional
// user gestures.
export type ModelPickerSelectTrigger =
  | "tier"
  | "model"
  | "reasoning_effort"
  | "revert";

interface ModelPickerBaseProps {
  surface: ModelPickerSurface;
  clientType: ClientType;
}

function baseExtra({
  surface,
  clientType,
}: ModelPickerBaseProps): TrackingExtra {
  return {
    surface,
    campaign_id: MODEL_PICKER_CAMPAIGN_ID,
    client_type: clientType,
  };
}

// Describes the resulting selection (tier vs. concrete model + effort) for a
// `select` event.
function selectionExtra(display: SelectionDisplay): TrackingExtra {
  switch (display.kind) {
    case "tier":
      return { selection_kind: "tier", tier_id: display.tierId };
    case "model":
      return {
        selection_kind: "model",
        model_id: display.model.modelId,
        provider_id: display.model.providerId,
        reasoning_effort: display.effort,
      };
    default:
      assertNeverAndIgnore(display);
      return { selection_kind: "unknown" };
  }
}

// Fired once per highlight impression, when the discovery glint is actually
// rendered. The caller is responsible for de-duplicating re-renders.
export function trackModelPickerExposure(base: ModelPickerBaseProps): void {
  trackEvent({
    area: TRACKING_AREAS.ASSISTANT,
    object: TRACKING_OBJECT,
    action: TRACKING_ACTIONS.VIEW,
    extra: baseExtra(base),
  });
}

// Fired when the picker dropdown opens.
export function trackModelPickerOpen(base: ModelPickerBaseProps): void {
  trackEvent({
    area: TRACKING_AREAS.ASSISTANT,
    object: TRACKING_OBJECT,
    action: TRACKING_ACTIONS.OPEN,
    extra: baseExtra(base),
  });
}

// Fired when the user commits a tier, model, or reasoning-effort change, or
// reverts to the agent default. `display` is the resulting selection.
export function trackModelPickerSelect({
  display,
  trigger,
  ...base
}: ModelPickerBaseProps & {
  display: SelectionDisplay;
  trigger: ModelPickerSelectTrigger;
}): void {
  trackEvent({
    area: TRACKING_AREAS.ASSISTANT,
    object: TRACKING_OBJECT,
    action: TRACKING_ACTIONS.SELECT,
    extra: {
      ...baseExtra(base),
      trigger,
      ...selectionExtra(display),
    },
  });
}
