import { useEffect, useId, useRef, useState } from "react";
import type { SVGProps } from "react";

/**
 * Animated version of sparkle's `ListSelect` — the plan glyph — for while a plan
 * is running.
 *
 * The loop, per the design note in the Proposition section ("Animation is
 * checked, goes up, line adds, checked, goes up etc"): a new line slides in at
 * the bottom, its tick draws in, then the stack shifts up by one row and the top
 * line is clipped away. Repeat.
 *
 * Geometry is lifted from `ListSelect.tsx` so the animated and static glyphs are
 * interchangeable: inside `translate(2.055 4.403)`, three rows at a 6-unit
 * pitch, each an `rx=1` bar from x 5.95 to 19.95 plus a tick spanning x 0–4.
 * The tick is the icon's own two paths (a thin stroke plus its outline).
 */

const ROW_PITCH = 6;
const VISIBLE_ROWS = 3;

// One step: the new bottom row settles, its tick draws in, the stack shifts up.
const CHECK_AT_MS = 420;
const SHIFT_AT_MS = 760;
const STEP_MS = 1180;

const SHIFT_MS = 380;
const CHECK_MS = 200;

const TICK_THIN =
  "M3.2862 0.404585C3.35898 0.331798 3.47685 0.331798 3.54964 0.404585C3.62242 0.477372 3.62242 0.595236 3.54964 0.668023L1.56875 2.64891C1.49596 2.7217 1.3781 2.7217 1.30531 2.64891L0.40491 1.74851C0.332123 1.67572 0.332123 1.55785 0.40491 1.48507C0.477697 1.41228 0.595561 1.41228 0.668348 1.48507L1.43703 2.25375L3.2862 0.404585Z";
const TICK_OUTLINE =
  "M3.12278 0.0882757C3.30111 -0.0294907 3.53423 -0.0293597 3.71262 0.0882757L3.79759 0.156635L3.86594 0.241596C4.00313 0.449634 3.98054 0.732215 3.79759 0.915424L1.81614 2.89687C1.60665 3.10605 1.26673 3.10624 1.05735 2.89687L0.15696 1.99648C-0.0524153 1.7871 -0.0522248 1.44718 0.15696 1.23769L0.241921 1.16933C0.420438 1.05146 0.653309 1.05133 0.831765 1.16933L0.915749 1.23769L1.43626 1.7582L3.0388 0.156635L3.12278 0.0882757Z";

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(query.matches);
    const onChange = (event: MediaQueryListEvent) => setPrefers(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return prefers;
}

function TaskRow({
  offset,
  isChecked,
  animate,
}: {
  offset: number;
  isChecked: boolean;
  animate: boolean;
}) {
  return (
    <g
      style={{
        transform: `translateY(${offset}px)`,
        transition: animate ? `transform ${SHIFT_MS}ms ease-out` : undefined,
      }}
    >
      <rect
        x="5.9497"
        y="0.5966"
        width="14"
        height="2"
        rx="1"
        fill="currentColor"
      />
      <g
        style={{
          opacity: isChecked ? 1 : 0,
          transform: isChecked ? "scale(1)" : "scale(0.55)",
          transformBox: "fill-box",
          transformOrigin: "center",
          transition: animate
            ? `opacity ${CHECK_MS}ms ease-out, transform ${CHECK_MS}ms ease-out`
            : undefined,
        }}
      >
        <path d={TICK_THIN} fill="currentColor" />
        <path d={TICK_OUTLINE} fill="currentColor" />
      </g>
    </g>
  );
}

export function PlanRunningIcon(props: SVGProps<SVGSVGElement>) {
  // React's useId contains colons; strip them so the `url(#…)` fragment
  // reference is safe across browsers.
  const clipId = `plan-run-${useId().replace(/:/g, "")}`;
  const prefersReducedMotion = usePrefersReducedMotion();

  // `cursor` is the newest (bottom) row. `isChecked` is whether its tick is in.
  const [cursor, setCursor] = useState(0);
  const [isChecked, setIsChecked] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const clear = () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };

    const runStep = () => {
      timers.current.push(
        window.setTimeout(() => setIsChecked(true), CHECK_AT_MS)
      );
      timers.current.push(
        window.setTimeout(() => {
          setCursor((current) => current + 1);
          setIsChecked(false);
        }, SHIFT_AT_MS)
      );
      timers.current.push(window.setTimeout(runStep, STEP_MS));
    };

    runStep();
    return clear;
  }, [prefersReducedMotion]);

  // Rendered from one row above the window to one below, so the leaving row is
  // clipped rather than unmounted mid-shift and the arriving one slides in.
  const topRow = cursor - (VISIBLE_ROWS - 1);
  const rows = [];
  for (let index = topRow - 1; index <= cursor + 1; index++) {
    rows.push({
      index,
      offset: (index - topRow) * ROW_PITCH,
      // Everything above the bottom row is already done.
      isChecked: index < cursor || (index === cursor && isChecked),
    });
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      fill="none"
      viewBox="0 0 24 24"
      {...props}
    >
      <defs>
        <clipPath id={clipId}>
          {/* Three rows tall: rows at -6 and +18 fall outside. */}
          <rect x="-4" y="-1.2" width="28" height="17.2" />
        </clipPath>
      </defs>
      <g transform="translate(2.055 4.403)">
        <g clipPath={`url(#${clipId})`}>
          {rows.map((row) => (
            <TaskRow
              key={row.index}
              offset={row.offset}
              isChecked={prefersReducedMotion ? true : row.isChecked}
              animate={!prefersReducedMotion}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
