import { cn } from "@app/components/poke/shadcn/lib/utils";
import { ArrowRight, BarLineChart, Icon, LinkWrapper } from "@dust-tt/sparkle";
import type { MotionValue } from "framer-motion";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import type { PointerEvent } from "react";

const ANALYTICS_BARS = [
  { position: 0, defaultHeight: 0.38, className: "bg-highlight-300" },
  {
    position: 1 / 3,
    defaultHeight: 0.62,
    className: "bg-highlight-300",
  },
  {
    position: 2 / 3,
    defaultHeight: 0.5,
    className: "bg-highlight-400",
  },
  { position: 1, defaultHeight: 0.88, className: "bg-highlight-500" },
] as const;
const ANALYTICS_BAR_HEIGHT = 32;
const ANALYTICS_BAR_MIN_HEIGHT = 0.35;
const ANALYTICS_BAR_MAX_HEIGHT = 1;
const ANALYTICS_BAR_FALLOFF = 2.4;
const ANALYTICS_CURSOR_REST_POSITION = -1;
const ANALYTICS_BAR_SPRING = {
  damping: 32,
  mass: 0.5,
  stiffness: 500,
};
const ANALYTICS_GRADIENT_REST_POSITION = 0.72;
const ANALYTICS_GRADIENT_CURSOR_OFFSET = 0.1;
const ANALYTICS_GRADIENT_POSITION_SPRING = {
  damping: 28,
  mass: 0.65,
  stiffness: 180,
};

function getAnalyticsBarOffset(
  cursorPosition: number,
  barPosition: number,
  defaultHeight: number
) {
  if (cursorPosition === ANALYTICS_CURSOR_REST_POSITION) {
    return (1 - defaultHeight) * ANALYTICS_BAR_HEIGHT;
  }

  const influence = Math.max(
    0,
    1 - Math.abs(cursorPosition - barPosition) * ANALYTICS_BAR_FALLOFF
  );
  const height =
    ANALYTICS_BAR_MIN_HEIGHT +
    influence * (ANALYTICS_BAR_MAX_HEIGHT - ANALYTICS_BAR_MIN_HEIGHT);

  return (1 - height) * ANALYTICS_BAR_HEIGHT;
}

function updateAnalyticsBars(
  event: PointerEvent<HTMLDivElement>,
  cursorPosition: MotionValue<number>,
  shouldReduceMotion: boolean
) {
  if (event.pointerType !== "mouse" || shouldReduceMotion) {
    return;
  }

  const bounds = event.currentTarget.getBoundingClientRect();
  if (bounds.width === 0) {
    return;
  }

  cursorPosition.set(
    Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
  );
}

interface AnalyticsBarProps {
  className: string;
  cursorPosition: MotionValue<number>;
  defaultHeight: number;
  position: number;
  shouldReduceMotion: boolean;
}

function AnalyticsBar({
  className,
  cursorPosition,
  defaultHeight,
  position,
  shouldReduceMotion,
}: AnalyticsBarProps) {
  const defaultOffset = getAnalyticsBarOffset(
    ANALYTICS_CURSOR_REST_POSITION,
    position,
    defaultHeight
  );
  const targetOffset = useTransform(cursorPosition, (value) =>
    getAnalyticsBarOffset(value, position, defaultHeight)
  );
  const springOffset = useSpring(targetOffset, ANALYTICS_BAR_SPRING);

  return (
    <span
      className="relative w-1.5 shrink-0 overflow-hidden rounded-full"
      style={{ height: ANALYTICS_BAR_HEIGHT }}
    >
      <motion.span
        className={`absolute inset-0 rounded-full will-change-transform ${className}`}
        style={{ y: shouldReduceMotion ? defaultOffset : springOffset }}
      />
    </span>
  );
}

function getAnalyticsGradientPosition(cursorPosition: number) {
  if (cursorPosition === ANALYTICS_CURSOR_REST_POSITION) {
    return ANALYTICS_GRADIENT_REST_POSITION;
  }

  return (
    cursorPosition + (1 - cursorPosition) * ANALYTICS_GRADIENT_CURSOR_OFFSET
  );
}

interface AnalyticsCursorGradientProps {
  cursorPosition: MotionValue<number>;
}

function AnalyticsCursorGradient({
  cursorPosition,
}: AnalyticsCursorGradientProps) {
  const targetPosition = useTransform(
    cursorPosition,
    getAnalyticsGradientPosition
  );
  const position = useSpring(
    targetPosition,
    ANALYTICS_GRADIENT_POSITION_SPRING
  );
  const background = useTransform(position, (value) => {
    const middle = value * 100;
    const leadingColor = middle * 0.45;

    return `linear-gradient(90deg, transparent 0%, var(--color-highlight-50) ${leadingColor}%, var(--color-highlight-100) ${middle}%, var(--color-highlight-50) 100%)`;
  });

  return (
    <motion.span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0",
        "opacity-[0.18] transition-opacity duration-200 ease-out motion-reduce:transition-none",
        "pointer-fine:group-hover:opacity-[0.3]"
      )}
      style={{ background }}
    />
  );
}

interface WorkspaceAnalyticsButtonProps {
  workspaceId: string;
}

export function WorkspaceAnalyticsButton({
  workspaceId,
}: WorkspaceAnalyticsButtonProps) {
  const cursorPosition = useMotionValue(ANALYTICS_CURSOR_REST_POSITION);
  const shouldReduceMotion = Boolean(useReducedMotion());

  return (
    <div
      className="w-full"
      onPointerLeave={() => cursorPosition.set(ANALYTICS_CURSOR_REST_POSITION)}
      onPointerMove={(event) =>
        updateAnalyticsBars(event, cursorPosition, shouldReduceMotion)
      }
    >
      <LinkWrapper
        href={`/poke/${workspaceId}/analytics`}
        className={cn(
          "group relative isolate flex min-h-20 w-full items-center gap-3 overflow-hidden",
          "rounded-lg border border-highlight-200 bg-linear-to-r from-background via-background to-highlight-50/50",
          "p-4 text-left shadow-sm outline-hidden",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted-background"
        )}
      >
        <AnalyticsCursorGradient cursorPosition={cursorPosition} />
        <div
          aria-hidden="true"
          className={cn(
            "relative z-10 flex h-11 w-11 shrink-0 items-center justify-center",
            "rounded-lg border border-highlight-200 bg-background text-highlight-500 shadow-sm"
          )}
        >
          <Icon visual={BarLineChart} size="md" />
        </div>
        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold text-foreground">
            Analytics
          </span>
          <span className="text-xs text-muted-foreground">
            Explore credit usage and attribution.
          </span>
        </div>
        <div
          aria-hidden="true"
          className="relative z-10 ml-auto hidden h-9 items-end gap-1.5 opacity-70 sm:flex"
        >
          {ANALYTICS_BARS.map((bar) => (
            <AnalyticsBar
              key={bar.position}
              {...bar}
              cursorPosition={cursorPosition}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))}
        </div>
        <Icon
          visual={ArrowRight}
          size="sm"
          className="relative z-10 text-highlight-500"
        />
      </LinkWrapper>
    </div>
  );
}
