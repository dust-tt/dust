import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { cn } from "@dust-tt/sparkle";
import capitalize from "lodash/capitalize";
import { useRef, useState } from "react";

interface ReasoningEffortSliderProps {
  // Ordered list of the efforts the model supports (from low to high). Always
  // holds at least two entries (single-effort models render no slider).
  efforts: ReasoningEffort[];
  value: ReasoningEffort;
  onChange: (effort: ReasoningEffort) => void;
}

// Geometry, in pixels. The track is a pill; the thumb sits inside it with a
// small margin (like a switch) and its center travels within
// [INSET_PX, width - INSET_PX] so it never overflows.
const TRACK_HEIGHT_PX = 24;
const THUMB_MARGIN_PX = 3;
const THUMB_SIZE_PX = TRACK_HEIGHT_PX - 2 * THUMB_MARGIN_PX;
const INSET_PX = THUMB_MARGIN_PX + THUMB_SIZE_PX / 2;

// Where a position sits along the track as a 0..1 fraction (evenly spread).
function fractionForIndex(index: number, count: number): number {
  return count <= 1 ? 0 : index / (count - 1);
}

// The thumb (and tick) center for a fraction, inset so it stays inside the pill.
function thumbCenter(fraction: number): string {
  return `calc(${INSET_PX}px + ${fraction} * (100% - ${2 * INSET_PX}px))`;
}

// The blue fill runs from the left margin up to the thumb's right edge, so the
// thumb — same height as the fill — always caps it cleanly.
function fillWidth(fraction: number): string {
  const base = INSET_PX + THUMB_SIZE_PX / 2 - THUMB_MARGIN_PX;
  return `calc(${base}px + ${fraction} * (100% - ${2 * INSET_PX}px))`;
}

// A switch-style reasoning-effort selector: a filled track with a thumb that
// snaps to one tick per supported effort. Clicking a position (or dragging the
// thumb) reports the nearest effort through `onChange`; the thumb animates to
// clicked positions and tracks the pointer while dragging. Rendered inline under
// a selected model row in the model picker.
export function ReasoningEffortSlider({
  efforts,
  value,
  onChange,
}: ReasoningEffortSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const count = efforts.length;
  const selectedIndex = Math.max(0, efforts.indexOf(value));
  const selectedFraction = fractionForIndex(selectedIndex, count);

  // Map a pointer x-position to the nearest effort and report it. The pointer is
  // mapped against the thumb's travel range so clicks near the ends still
  // resolve to the edge efforts.
  const selectFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track || count === 0) {
      return;
    }
    const rect = track.getBoundingClientRect();
    const travel = Math.max(1, rect.width - 2 * INSET_PX);
    const ratio = (clientX - rect.left - INSET_PX) / travel;
    const index = Math.min(
      count - 1,
      Math.max(0, Math.round(ratio * (count - 1)))
    );
    const next = efforts[index];
    if (next !== value) {
      onChange(next);
    }
  };

  const moveBy = (delta: number) => {
    const index = Math.min(count - 1, Math.max(0, selectedIndex + delta));
    const next = efforts[index];
    if (next !== value) {
      onChange(next);
    }
  };

  // Skip the movement transition while dragging so the thumb tracks the pointer
  // without lag; keep it for click-to-jump.
  const transition = isDragging ? "" : "transition-all duration-150 ease-out";

  return (
    <div
      className="select-none px-3 pb-2 pt-1.5"
      // Keep pointer/keyboard interactions from bubbling to the surrounding
      // dropdown, which would treat them as row selection or menu navigation.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={selectedIndex}
        aria-valuetext={capitalize(value)}
        className="relative cursor-pointer touch-none rounded-full bg-primary-300 outline-none"
        style={{ height: TRACK_HEIGHT_PX }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setIsDragging(true);
          selectFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (isDragging) {
            selectFromClientX(e.clientX);
          }
        }}
        onPointerUp={(e) => {
          setIsDragging(false);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            moveBy(-1);
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            moveBy(1);
          }
        }}
      >
        {/* Filled portion. */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-full bg-highlight",
            transition
          )}
          style={{
            left: THUMB_MARGIN_PX,
            height: THUMB_SIZE_PX,
            width: fillWidth(selectedFraction),
          }}
        />
        {/* A dot at every effort except the selected one (covered by the thumb):
            a light dot over the filled portion, a gray one over the rest. */}
        {efforts.map((effort, index) =>
          index === selectedIndex ? null : (
            <div
              key={effort}
              className={cn(
                "absolute top-1/2 h-1.5 w-1.5 rounded-full",
                index < selectedIndex ? "bg-white/80" : "bg-primary-500"
              )}
              style={{
                left: thumbCenter(fractionForIndex(index, count)),
                transform: "translate(-50%, -50%)",
              }}
            />
          )
        )}
        {/* Thumb. */}
        <div
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm",
            transition
          )}
          style={{
            left: thumbCenter(selectedFraction),
            height: THUMB_SIZE_PX,
            width: THUMB_SIZE_PX,
          }}
        />
      </div>
      {/* Labels, one under each effort. Edge labels are aligned to the track
          ends so they never overflow the row. */}
      <div className="relative mt-1.5 h-4">
        {efforts.map((effort, index) => {
          const fraction = fractionForIndex(index, count);
          const isFirst = index === 0;
          const isLast = index === count - 1;
          const transform = !isFirst
            ? isLast
              ? "translateX(-100%)"
              : "translateX(-50%)"
            : "translateX(0)";
          return (
            <button
              key={effort}
              type="button"
              className={cn(
                "absolute whitespace-nowrap text-xs",
                index === selectedIndex
                  ? "font-medium text-foreground dark:text-foreground-night"
                  : "text-muted-foreground dark:text-muted-foreground-night"
              )}
              style={{ left: thumbCenter(fraction), transform }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (effort !== value) {
                  onChange(effort);
                }
              }}
            >
              {capitalize(effort)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
