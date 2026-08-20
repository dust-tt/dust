import { cn } from "@sparkle/lib/utils";
import React from "react";

const DEFAULT_INTERVAL_SECONDS = 7;
const DEFAULT_SWEEP_DURATION_MS = 840;
const DEFAULT_PULSE_DURATION_MS = 800;
const DEFAULT_START_DELAY_SECONDS = 0.5;

const SWEEP_FROM = "translateX(-100%)";
const SWEEP_TO = "translateX(160%)";
const EASING = "cubic-bezier(0.645, 0.045, 0.355, 1)";
const PULSE_SCALE = 1.08;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function findVisualBox(host: HTMLElement | null): HTMLElement | null {
  let element = host?.firstElementChild ?? null;
  while (element instanceof HTMLElement) {
    if (window.getComputedStyle(element).borderRadius !== "0px") {
      return element;
    }
    const child = element.firstElementChild;
    if (!child) {
      return element;
    }
    element = child;
  }
  return null;
}

function useMatchedRadius(
  hostRef: React.RefObject<HTMLElement | null>,
  isEnabled: boolean
): string | undefined {
  const [radius, setRadius] = React.useState<string>();

  React.useEffect(() => {
    if (!isEnabled) {
      return;
    }
    const target = findVisualBox(hostRef.current);
    if (!target) {
      return;
    }
    const read = () => setRadius(window.getComputedStyle(target).borderRadius);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(target);
    return () => observer.disconnect();
  }, [hostRef, isEnabled]);

  return radius;
}

interface GlintTiming {
  intervalSeconds: number;
  sweepDurationMs: number;
  pulseDurationMs: number;
  startDelaySeconds: number;
}

function useGlintTimeline(
  ringRef: React.RefObject<HTMLElement | null>,
  sweepRef: React.RefObject<HTMLElement | null>,
  isBouncing: boolean,
  isSweeping: boolean,
  isEnabled: boolean,
  timing: GlintTiming
) {
  const {
    intervalSeconds,
    sweepDurationMs,
    pulseDurationMs,
    startDelaySeconds,
  } = timing;

  React.useEffect(() => {
    if (!isEnabled || prefersReducedMotion()) {
      return;
    }

    const intervalMs = Math.max(
      intervalSeconds * 1000,
      pulseDurationMs + sweepDurationMs
    );
    const options: KeyframeAnimationOptions = {
      duration: intervalMs,
      delay: startDelaySeconds * 1000,
      iterations: Number.POSITIVE_INFINITY,
      easing: "linear",
    };
    const pulseEnd = pulseDurationMs / intervalMs;
    const sweepEnd = (pulseDurationMs + sweepDurationMs) / intervalMs;

    const animations: Animation[] = [];

    if (isBouncing && ringRef.current) {
      animations.push(
        ringRef.current.animate(
          [
            { offset: 0, transform: "scale(1)", easing: EASING },
            {
              offset: pulseEnd * 0.25,
              transform: `scale(${PULSE_SCALE})`,
              easing: EASING,
            },
            { offset: pulseEnd * 0.5, transform: "scale(1)", easing: EASING },
            {
              offset: pulseEnd * 0.75,
              transform: `scale(${PULSE_SCALE})`,
              easing: EASING,
            },
            { offset: pulseEnd, transform: "scale(1)" },
            { offset: 1, transform: "scale(1)" },
          ],
          options
        )
      );
    }

    if (isSweeping && sweepRef.current) {
      animations.push(
        sweepRef.current.animate(
          [
            { offset: 0, transform: SWEEP_FROM },
            { offset: pulseEnd, transform: SWEEP_FROM, easing: EASING },
            { offset: sweepEnd, transform: SWEEP_TO },
            { offset: 1, transform: SWEEP_TO },
          ],
          options
        )
      );
    }

    return () => animations.forEach((animation) => animation.cancel());
  }, [
    ringRef,
    sweepRef,
    isBouncing,
    isSweeping,
    isEnabled,
    intervalSeconds,
    sweepDurationMs,
    pulseDurationMs,
    startDelaySeconds,
  ]);
}

interface GlintStreaksProps {
  className?: string;
}

const GlintStreaks = React.forwardRef<HTMLSpanElement, GlintStreaksProps>(
  ({ className }, ref) => (
    <span ref={ref} className={cn("absolute inset-0", className)}>
      <span className="absolute -top-1/2 left-0 h-[200%] w-[max(7px,5%)] rotate-[30deg] bg-linear-to-b from-transparent via-blue-50 to-transparent blur-[2px]" />
      <span className="absolute -top-1/2 left-[max(9px,7%)] h-[200%] w-[max(3px,2%)] rotate-[30deg] bg-linear-to-b from-transparent via-blue-50/60 to-transparent blur-[2px]" />
    </span>
  )
);
GlintStreaks.displayName = "GlintStreaks";

export interface DiscoveryGlintProps {
  children: React.ReactNode;
  /** Turns the whole effect on or off — toggling it shifts no layout. */
  isActive?: boolean;
  /** Enables the pulsing ring half of the effect. */
  isBouncing?: boolean;
  /** Enables the sweeping light streaks half of the effect. */
  isSweeping?: boolean;
  /** Seconds between effect cycles; raising it spaces the effect out instead of slowing it down. */
  intervalSeconds?: number;
  /** Duration of the streak sweep, which starts the moment the pulse ends. */
  sweepDurationMs?: number;
  /** Duration of the double ring pulse at the start of each cycle. */
  pulseDurationMs?: number;
  /** Delay before the first cycle starts. */
  startDelaySeconds?: number;
  /** The wrapper is inline-flex by default — pass "flex w-full" for block-level targets such as a sidebar row. */
  className?: string;
}

/**
 * Draws attention to a control the user has not discovered yet: a blue ring
 * that pulses periodically with diagonal light streaks sweeping across, as a
 * pointer-events-none overlay that changes no layout, box, or hit area and
 * mirrors the wrapped element's corner radius. Use it for a short, time-boxed
 * campaign pointing at one newly shipped control — never on more than one
 * element per screen; motion is dropped under prefers-reduced-motion.
 * @summary Pulsing glint overlay for feature discovery.
 */
export function DiscoveryGlint({
  children,
  isActive = true,
  isBouncing = true,
  isSweeping = true,
  intervalSeconds = DEFAULT_INTERVAL_SECONDS,
  sweepDurationMs = DEFAULT_SWEEP_DURATION_MS,
  pulseDurationMs = DEFAULT_PULSE_DURATION_MS,
  startDelaySeconds = DEFAULT_START_DELAY_SECONDS,
  className,
}: DiscoveryGlintProps) {
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const ringRef = React.useRef<HTMLSpanElement>(null);
  const sweepRef = React.useRef<HTMLSpanElement>(null);
  const radius = useMatchedRadius(hostRef, isActive);
  const radiusStyle = radius ? { borderRadius: radius } : undefined;

  useGlintTimeline(ringRef, sweepRef, isBouncing, isSweeping, isActive, {
    intervalSeconds,
    sweepDurationMs,
    pulseDurationMs,
    startDelaySeconds,
  });

  return (
    <span
      ref={hostRef}
      className={cn("glint-host relative inline-flex", className)}
      data-glint-active={isActive ? "true" : undefined}
    >
      {children}
      {isActive && (
        <>
          <span
            ref={ringRef}
            aria-hidden
            className="glint-ring pointer-events-none absolute inset-0 border border-blue-200"
            style={radiusStyle}
          />
          {isSweeping && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden"
              style={radiusStyle}
            >
              <GlintStreaks ref={sweepRef} className="glint-sweep" />
              <GlintStreaks className="glint-sweep-hover" />
            </span>
          )}
        </>
      )}
    </span>
  );
}
