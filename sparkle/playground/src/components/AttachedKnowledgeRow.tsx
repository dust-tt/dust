import { Chip, cn } from "@dust-tt/sparkle";
import React from "react";

import type { KnowledgeItem } from "../data/knowledgeItems";

interface AttachedKnowledgeRowProps {
  items: KnowledgeItem[];
  removingIds: Set<string>;
  onRemove: (item: KnowledgeItem) => void;
}

export function AttachedKnowledgeRow({
  items,
  removingIds,
  onRemove,
}: AttachedKnowledgeRowProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-3">
      {items.map((item) => (
        <Chip
          key={item.id}
          label={item.name}
          icon={item.icon}
          color="primary"
          onRemove={() => onRemove(item)}
          className={cn(
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
            removingIds.has(item.id) &&
              "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:zoom-out-95 motion-safe:duration-100"
          )}
        />
      ))}
    </div>
  );
}
