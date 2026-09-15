import type { TrackingExtra } from "@app/lib/tracking";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import { useCallback, useEffect, useRef } from "react";

export type BuilderEntryPoint = "new" | "duplicate" | "edit";

type BuilderKind = "agent" | "skill";

// Objects are named so the events read as `builder:agent_builder:open` and
// `builder:save_agent:submit`, matching the existing `builder:create_agent:submit` taxonomy.
const BUILDER_OBJECTS: Record<BuilderKind, { open: string; save: string }> = {
  agent: { open: "agent_builder", save: "save_agent" },
  skill: { open: "skill_builder", save: "save_skill" },
};

interface BuilderTracking {
  trackSave: (extra: TrackingExtra) => void;
}

/**
 * Tracks one sitting in a builder: an `open` event when the builder mounts, then a `save` event
 * per successful save carrying how long the builder had been open and how many saves came before
 * it. Pairing the two client-side keeps the duration independent of pageview capture, which does
 * not fire when an existing agent or skill is saved in place.
 *
 * `duration_ms` is wall-clock since mount, so it includes time spent in a background tab.
 */
export function useBuilderTracking({
  builder,
  entryPoint,
}: {
  builder: BuilderKind;
  entryPoint: BuilderEntryPoint;
}): BuilderTracking {
  const openedAtRef = useRef(Date.now());
  const saveCountRef = useRef(0);

  // A sitting opens exactly once, so this must not re-fire if its inputs change identity.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally mount-only.
  useEffect(() => {
    trackEvent({
      area: TRACKING_AREAS.BUILDER,
      object: BUILDER_OBJECTS[builder].open,
      action: TRACKING_ACTIONS.OPEN,
      extra: { entry_point: entryPoint },
    });
  }, []);

  const trackSave = useCallback(
    (extra: TrackingExtra) => {
      saveCountRef.current += 1;

      trackEvent({
        area: TRACKING_AREAS.BUILDER,
        object: BUILDER_OBJECTS[builder].save,
        action: TRACKING_ACTIONS.SUBMIT,
        extra: {
          ...extra,
          entry_point: entryPoint,
          duration_ms: Date.now() - openedAtRef.current,
          save_index: saveCountRef.current,
        },
      });
    },
    [builder, entryPoint]
  );

  return { trackSave };
}
