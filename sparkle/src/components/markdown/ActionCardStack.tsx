import { cn } from "@sparkle/lib/utils";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import React from "react";

// Ordered from the layer right behind the front card to the farthest one.
const LAYER_CLASSES = [
  "-rotate-[2.0deg] -translate-x-2.5",
  "rotate-[2.0deg] translate-x-2.5",
];

export interface ActionCardStackProps {
  /** Number of cards in the pile; at most 3 are drawn, the front one being `children`. */
  cardCount: number;
  /** The front card, typically an `ActionCardBlock` with `cardVariant="secondary"` so it reads lighter than the layers. */
  children: React.ReactNode;
  /** Identifies the front card; changing it fades the previous front card out, revealing the new one. */
  frontCardKey?: string;
  className?: string;
}

const FrontCard = React.forwardRef<
  HTMLDivElement,
  { children: React.ReactNode }
>(function FrontCard({ children }, ref) {
  // A leaving card lingers during its fade; keep it out of reach of assistive tech.
  const isPresent = useIsPresent();

  return (
    <motion.div
      ref={ref}
      aria-hidden={!isPresent}
      className={cn(
        "relative rounded-2xl shadow",
        !isPresent && "pointer-events-none z-10"
      )}
      exit={{ opacity: 0, transition: { duration: 0.3, ease: "easeOut" } }}
    >
      {children}
    </motion.div>
  );
});

/**
 * Pile of action cards rendered inside an agent message when several
 * proposals are grouped together. Only the front card is interactive; the
 * cards behind it are decorative, tilted layers that stretch to the front
 * card's height.
 * @summary Tilted pile of action cards with an interactive front card.
 */
export function ActionCardStack({
  cardCount,
  children,
  frontCardKey,
  className,
}: ActionCardStackProps) {
  const layers = LAYER_CLASSES.slice(0, Math.max(cardCount - 1, 0));

  return (
    <div
      // Room for the tilted layers is kept even without them, so the front card never shifts as
      // the pile shrinks.
      className={cn("relative mt-3 w-full max-w-lg", className)}
    >
      {layers.reverse().map((layerClassName) => (
        <div
          key={layerClassName}
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-2xl border border-border",
            "bg-muted-background shadow",
            layerClassName
          )}
        />
      ))}
      <AnimatePresence initial={false} mode="popLayout">
        <FrontCard key={frontCardKey}>{children}</FrontCard>
      </AnimatePresence>
    </div>
  );
}
