import { classNames } from "@app/lib/utils";
import { Icon, Stars02 } from "@dust-tt/sparkle";

// Matches `h-9`; the ring is drawn inside the pill's own border.
const BUTTON_HEIGHT_PX = 36;
const RING_WIDTH_PX = 1.5;
const RING_INSET_PX = RING_WIDTH_PX / 2;
const RING_RADIUS_PX = BUTTON_HEIGHT_PX / 2 - RING_INSET_PX;

// Filling tracks the wheel tick for tick; draining back to empty is a longer
// eased release, so the two read as different gestures.
const FILL_DURATION_MS = 80;
const FILL_EASING = "linear";
const DRAIN_DURATION_MS = 300;
const DRAIN_EASING = "var(--ease-emphasized)";

interface DiscoverButtonProps {
  onClick: () => void;
  progress: number;
}

export function DiscoverButton({ onClick, progress }: DiscoverButtonProps) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const isComplete = progress >= 1;
  const isDraining = progress === 0;
  const durationMs = isDraining ? DRAIN_DURATION_MS : FILL_DURATION_MS;
  const easing = isDraining ? DRAIN_EASING : FILL_EASING;

  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "group relative inline-flex h-9 items-center gap-2 rounded-full pl-3 pr-4",
        "border border-border bg-background text-foreground",
        "shadow-[0px_1px_1px_-0.5px_rgba(0,0,0,0.05),0px_2px_4px_-2px_rgba(0,0,0,0.06)]",
        "transition-[color,background-color,border-color,box-shadow,scale,translate] duration-[160ms] ease-emphasized",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[0px_2px_2px_-1px_rgba(0,0,0,0.06),0px_6px_10px_-4px_rgba(0,0,0,0.10)]",
        "active:translate-y-0 active:scale-[0.97] motion-reduce:active:scale-100",
        isComplete &&
          "border-highlight-200 bg-highlight-50 text-highlight-700 dark:border-highlight-800"
      )}
    >
      {/* `pathLength` normalizes the rounded rect's perimeter to 100, so the
          dash offset is the progress percentage whatever the pill's width. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)] overflow-visible text-blue-500"
      >
        <rect
          x={RING_INSET_PX}
          y={RING_INSET_PX}
          width={`calc(100% - ${RING_WIDTH_PX}px)`}
          height={BUTTON_HEIGHT_PX - RING_WIDTH_PX}
          rx={RING_RADIUS_PX}
          ry={RING_RADIUS_PX}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_WIDTH_PX}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - percent}
          style={{
            transition: `stroke-dashoffset ${durationMs}ms ${easing}`,
          }}
        />
      </svg>
      <span
        aria-hidden
        className={classNames(
          "relative flex transition-[color,rotate] motion-reduce:rotate-0",
          isComplete ? "text-highlight-500" : "text-muted-foreground",
          "[@media(hover:hover)_and_(pointer:fine)]:group-hover:text-highlight-500"
        )}
        style={{
          rotate: `${progress * 90}deg`,
          transitionDuration: `${durationMs}ms`,
          transitionTimingFunction: easing,
        }}
      >
        <Icon visual={Stars02} size="xs" />
      </span>
      <span className="relative grid heading-sm">
        <span
          aria-hidden={isComplete}
          className={classNames(
            "col-start-1 row-start-1 transition-[opacity,translate,filter] duration-200 ease-emphasized motion-reduce:transition-opacity",
            isComplete &&
              "-translate-y-1 opacity-0 blur-[2px] motion-reduce:translate-y-0 motion-reduce:blur-none"
          )}
        >
          Discover Skills and agents
        </span>
        <span
          aria-hidden={!isComplete}
          className={classNames(
            "col-start-1 row-start-1 transition-[opacity,translate,filter] duration-200 ease-emphasized motion-reduce:transition-opacity",
            !isComplete &&
              "translate-y-1 opacity-0 blur-[2px] motion-reduce:translate-y-0 motion-reduce:blur-none"
          )}
        >
          Opening Discover
        </span>
      </span>
    </button>
  );
}
