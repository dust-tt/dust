import { useClientType } from "@app/lib/context/clientType";
import { cn } from "@dust-tt/sparkle";
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
    if (!hasSpentDismissalRef.current && !isReplayRequested()) {
      hasSpentDismissalRef.current = true;
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, String(readDismissals() + 1));
      } catch {}
    }
    setIsVisible(false);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !isVisible) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0) {
        dismiss();
      }
    };
    host.addEventListener("pointerdown", onPointerDown);
    return () => host.removeEventListener("pointerdown", onPointerDown);
  }, [isVisible, dismiss]);

  return (
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
