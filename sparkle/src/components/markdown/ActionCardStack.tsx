import { cn } from "@sparkle/lib/utils";
import React from "react";

const MAX_VISIBLE_CARDS = 3;

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
 * @cc [owner:avervaet,label:react] decorative-layers
 * At most two layers MUST be drawn behind `children`, one fewer than
 * `cardCount` (none when `cardCount` is 1 or less). Layers MUST be hidden from
 * assistive technologies and carry no content or handlers, so `children`
 * stays the only interactive element of the pile.
 */
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
  const layerCount = Math.min(Math.max(cardCount, 1), MAX_VISIBLE_CARDS) - 1;

  return (
    <div
      className={cn(
        "relative w-full max-w-lg",
        layerCount > 0 && "mt-3",
        className
      )}
    >
      {LAYER_CLASSES.slice(0, layerCount)
        .reverse()
        .map((layerClassName) => (
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
