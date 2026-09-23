import { cn } from "@sparkle/lib/utils";
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
  className?: string;
}

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
  className,
}: ActionCardStackProps) {
  const layers = LAYER_CLASSES.slice(0, Math.max(cardCount - 1, 0));

  return (
    <div
      className={cn(
        "relative w-full max-w-lg",
        layers.length > 0 && "mt-3",
        className
      )}
    >
      {layers.reverse().map((layerClassName) => (
        <div
          key={layerClassName}
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-2xl border border-border",
            "bg-muted-background shadow-2xl",
            layerClassName
          )}
        />
      ))}
      <div className="relative">{children}</div>
    </div>
  );
}
