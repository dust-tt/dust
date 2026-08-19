import { trackModelPickerExposure } from "@app/components/model_picker/modelPickerTracking";
import { useClientType } from "@app/lib/context/clientType";
import { DiscoveryGlint } from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const LOCAL_STORAGE_KEY = "modelPickerHighlightDismissals";

const MAX_DISMISSALS = 2;

const CAMPAIGN_END = Date.parse("2026-08-26T23:59:59Z");

const REPLAY_PARAM = "replayHighlight";

function isReplayRequested(): boolean {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has(REPLAY_PARAM)
  );
}

function readDismissals(): number {
  if (typeof window === "undefined") {
    return MAX_DISMISSALS;
  }
  try {
    const parsed = Number.parseInt(
      localStorage.getItem(LOCAL_STORAGE_KEY) ?? "",
      10
    );
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch {
    return MAX_DISMISSALS;
  }
}

interface ModelPickerHighlightProps {
  children: React.ReactNode;
}

export function ModelPickerHighlight({ children }: ModelPickerHighlightProps) {
  const clientType = useClientType();
  const isExtension = clientType === "extension";
  const [isActive, setIsActive] = useState<boolean>(
    () =>
      !isExtension &&
      (isReplayRequested() ||
        (Date.now() <= CAMPAIGN_END && readDismissals() < MAX_DISMISSALS))
  );
  const hostRef = useRef<HTMLSpanElement>(null);
  const hasSpentDismissalRef = useRef(false);
  const hasTrackedExposureRef = useRef(false);

  // Fire a single exposure event per mount, the first time the glint is
  // actually rendered. Guarded by a ref so re-renders (and toggling back off
  // after a dismissal) never emit a duplicate.
  useEffect(() => {
    if (isActive && !hasTrackedExposureRef.current) {
      hasTrackedExposureRef.current = true;
      trackModelPickerExposure({
        surface: "conversation_input_bar",
        clientType,
      });
    }
  }, [isActive, clientType]);

  const dismiss = useCallback(() => {
    if (!hasSpentDismissalRef.current && !isReplayRequested()) {
      hasSpentDismissalRef.current = true;
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, String(readDismissals() + 1));
      } catch {
        // localStorage may be full or unavailable.
      }
    }
    setIsActive(false);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !isActive) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0) {
        dismiss();
      }
    };
    host.addEventListener("pointerdown", onPointerDown);
    return () => host.removeEventListener("pointerdown", onPointerDown);
  }, [isActive, dismiss]);

  return (
    <span ref={hostRef} className="inline-flex">
      <DiscoveryGlint isActive={isActive}>{children}</DiscoveryGlint>
    </span>
  );
}
