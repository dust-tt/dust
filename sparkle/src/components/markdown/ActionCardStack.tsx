import { cn } from "@sparkle/lib/utils";
import type { Variants } from "framer-motion";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "framer-motion";
import React, { useEffect, useState } from "react";

// Ordered from the layer right behind the front card to the farthest one.
const LAYER_CLASSES = [
  "-rotate-[2.0deg] -translate-x-2.5",
  "rotate-[2.0deg] translate-x-2.5",
];

export type ActionCardStackExitDirection = "left" | "right";

export interface ActionCardStackCard {
  /** Stable identity of the card; the pile tells which cards left it by their key. */
  key: string;
  /** Typically an `ActionCardBlock` with `cardVariant="secondary"` so it reads lighter than the layers. */
  card: React.ReactNode;
}

export interface ActionCardStackProps {
  /** Cards of the pile, front first. Only the front card is rendered, with at most two decorative layers behind it. Cards dropped from the front of the list leave one after another, each shown in front before it goes. */
  cards: ActionCardStackCard[];
  /** Where leaving cards slide out, typically right once accepted and left once rejected, with a blue or red outline respectively. They fade out in place when unset. */
  exitDirection?: ActionCardStackExitDirection;
  className?: string;
}

interface ExitContext {
  direction?: ActionCardStackExitDirection;
  shouldReduceMotion: boolean;
}

const EXIT_DURATION = 0.45;
const ENTER_DURATION = 0.35;
const FADE_DURATION = 0.3;
// Time each card decided in bulk stays in front before the next one replaces it.
const CASCADE_STEP_MS = 750;

const EXIT_OUTLINE_COLORS: Record<ActionCardStackExitDirection, string> = {
  right: "var(--color-highlight-300)",
  left: "var(--color-warning-300)",
};

const FRONT_CARD_VARIANTS: Variants = {
  enter: { opacity: 0, scale: 0.97 },
  center: {
    opacity: 1,
    scale: 1,
    x: 0,
    rotate: 0,
    transition: {
      duration: ENTER_DURATION,
      ease: "easeOut",
      delay: EXIT_DURATION / 2,
    },
  },
  exit: ({ direction, shouldReduceMotion }: ExitContext) => {
    const sign = direction === "right" ? 1 : -1;
    const slides = direction !== undefined && !shouldReduceMotion;
    return {
      opacity: 0,
      x: slides ? `${sign * 40}%` : 0,
      rotate: slides ? sign * 6 : 0,
      outlineColor: direction ? EXIT_OUTLINE_COLORS[direction] : "transparent",
      zIndex: 1,
      pointerEvents: "none",
      transition: {
        duration: EXIT_DURATION,
        ease: "easeIn",
        outlineColor: { duration: 0.12 },
      },
    };
  },
};

const LAYER_VARIANTS: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: FADE_DURATION } },
  exit: { opacity: 0, transition: { duration: FADE_DURATION } },
};

interface FrontCardProps {
  children: React.ReactNode;
  isInteractive: boolean;
}

const FrontCard = React.forwardRef<HTMLDivElement, FrontCardProps>(
  function FrontCard({ children, isInteractive }, ref) {
    // A leaving card lingers during its animation; keep it out of reach of assistive tech.
    const isPresent = useIsPresent();
    const isActive = isPresent && isInteractive;

    return (
      <motion.div
        ref={ref}
        aria-hidden={!isActive}
        className={cn(
          "relative rounded-2xl shadow outline-2 -outline-offset-1 outline-transparent",
          !isActive && "pointer-events-none"
        )}
        variants={FRONT_CARD_VARIANTS}
        initial="enter"
        animate="center"
        exit="exit"
      >
        {children}
      </motion.div>
    );
  }
);

// Cards dropped from the front of the list since the previous render, in pile order.
function droppedFrontCards(
  previous: ActionCardStackCard[],
  next: ActionCardStackCard[]
) {
  const nextKeys = new Set(next.map(({ key }) => key));
  const keptIndex = previous.findIndex(({ key }) => nextKeys.has(key));
  return keptIndex === -1 ? previous : previous.slice(0, keptIndex);
}

/**
 * Pile of action cards rendered inside an agent message when several
 * proposals are grouped together. Only the front card is interactive; the
 * cards behind it are decorative, tilted layers that stretch to the front
 * card's height.
 * @summary Tilted pile of action cards with an interactive front card.
 */
export function ActionCardStack({
  cards,
  exitDirection,
  className,
}: ActionCardStackProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [previousCards, setPreviousCards] = useState(cards);
  // Cards decided together that still have to show in front before leaving.
  const [leavingCards, setLeavingCards] = useState<ActionCardStackCard[]>([]);

  if (cards !== previousCards) {
    const dropped = droppedFrontCards(previousCards, cards);
    if (dropped.length > 0) {
      // The front card leaves right away, unless a cascade is already running.
      setLeavingCards(
        leavingCards.length > 0
          ? [...leavingCards, ...dropped]
          : dropped.slice(1)
      );
    }
    setPreviousCards(cards);
  }

  useEffect(() => {
    if (leavingCards.length === 0) {
      return;
    }
    const timeout = setTimeout(
      () => setLeavingCards((current) => current.slice(1)),
      CASCADE_STEP_MS
    );
    return () => clearTimeout(timeout);
  }, [leavingCards]);

  const shownCards = [...leavingCards, ...cards];
  const [front] = shownCards;
  if (!front) {
    return null;
  }

  const layers = LAYER_CLASSES.slice(0, shownCards.length - 1);
  // Exit variants read this at exit time, so leaving cards follow the latest decision.
  const exitContext: ExitContext = {
    direction: exitDirection,
    shouldReduceMotion,
  };

  return (
    <div
      className={cn(
        "relative w-full max-w-lg",
        layers.length > 0 && "mt-3",
        className
      )}
    >
      <AnimatePresence initial={false}>
        {layers
          .map((layerClassName) => (
            <motion.div
              key={layerClassName}
              aria-hidden
              className={cn(
                "absolute inset-0 rounded-2xl border border-border",
                "bg-muted-background shadow",
                layerClassName
              )}
              variants={LAYER_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
            />
          ))
          .reverse()}
      </AnimatePresence>
      <AnimatePresence initial={false} mode="popLayout" custom={exitContext}>
        <FrontCard key={front.key} isInteractive={leavingCards.length === 0}>
          {front.card}
        </FrontCard>
      </AnimatePresence>
    </div>
  );
}
