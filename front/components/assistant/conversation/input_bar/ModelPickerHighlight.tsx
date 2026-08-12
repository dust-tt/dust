import { useClientType } from "@app/lib/context/clientType";
import { cn } from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const LOCAL_STORAGE_KEY = "modelPickerHighlightDismissals";

// Two presses are taken as proof the control has been understood. Reloading
// brings the highlight back; only a press spends the allowance.
const MAX_DISMISSALS = 2;

// Ends the campaign on its own, so the highlight dies even if the code outlives
// it — including for anyone who never presses the picker.
const CAMPAIGN_END = Date.parse("2026-08-26T23:59:59Z");

// Add `?replayHighlight` to any URL to force the highlight on and spend nothing,
// so a deploy preview can still be checked once the allowance is gone.
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
    // No way to remember the count: stay quiet rather than nag forever.
    return MAX_DISMISSALS;
  }
}

interface GlintStreaksProps {
  className: string;
}

function GlintStreaks({ className }: GlintStreaksProps) {
  return (
    <span className={cn("absolute inset-0", className)}>
      <span className="absolute -top-1/4 left-0 h-[150%] w-[3px] rotate-[30deg] bg-blue-50 blur-[1px]" />
      <span className="absolute -top-1/3 left-[5px] h-[165%] w-[3px] rotate-[30deg] bg-blue-50/70 blur-[1px]" />
    </span>
  );
}

interface ModelPickerHighlightProps {
  children: React.ReactNode;
}

/**
 * Temporary discovery treatment for the model picker: a blue ring pulsing twice
 * every 7s, a light sweep chained after each pulse, and one extra sweep on hover.
 * Web only — the extension has its own storage and a more cramped input bar.
 */
export function ModelPickerHighlight({ children }: ModelPickerHighlightProps) {
  const isExtension = useClientType() === "extension";
  const [isVisible, setIsVisible] = useState<boolean>(
    () =>
      !isExtension &&
      (isReplayRequested() ||
        (Date.now() <= CAMPAIGN_END && readDismissals() < MAX_DISMISSALS))
  );
  const hostRef = useRef<HTMLSpanElement>(null);
  const hasSpentDismissalRef = useRef(false);

  const dismiss = useCallback(() => {
    // Ref-guarded rather than guarded inside the state updater, which has to stay
    // pure or React would double-count it under StrictMode.
    if (!hasSpentDismissalRef.current && !isReplayRequested()) {
      hasSpentDismissalRef.current = true;
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, String(readDismissals() + 1));
      } catch {
        // Nothing to do if the write is refused.
      }
    }
    setIsVisible(false);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !isVisible) {
      return;
    }
    // `pointerdown`, not `click`: Radix opens the menu on pointerdown and, being
    // modal, sets `pointer-events: none` on the body — the mouseup that follows
    // hit-tests to <html>, so no click event ever reaches this subtree.
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0) {
        dismiss();
      }
    };
    host.addEventListener("pointerdown", onPointerDown);
    return () => host.removeEventListener("pointerdown", onPointerDown);
  }, [isVisible, dismiss]);

  return (
    // The host stays mounted after dismissal: swapping it out would remount the
    // picker and close the dropdown the press just opened.
    <span ref={hostRef} className="glint-host relative inline-flex">
      {children}
      {isVisible && (
        <>
          <span
            aria-hidden
            className="glint-ring-pulse pointer-events-none absolute inset-0 rounded-lg border border-blue-200"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
          >
            <GlintStreaks className="glint-sweep" />
            <GlintStreaks className="glint-sweep-hover" />
          </span>
        </>
      )}
    </span>
  );
}
