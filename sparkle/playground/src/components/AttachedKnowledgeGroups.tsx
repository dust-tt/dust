import { Chip } from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import React from "react";

export type AttachedGroup = "capability" | "knowledge" | "file";

export interface AttachedItem {
  id: string;
  name: string;
  icon?: ComponentType<{ className?: string }>;
  group: AttachedGroup;
  // The exact string inserted into the composer. The attachment exists only
  // for as long as this text is present, which is what makes erasing the
  // token the way to remove it — there is no separate delete control.
  token: string;
}

// Order follows how they read back in the instructions rather than the menu.
const GROUPS: Array<{ group: AttachedGroup; label: string }> = [
  { group: "capability", label: "Capabilities" },
  { group: "knowledge", label: "Knowledge" },
  { group: "file", label: "Files" },
];

export function AttachedKnowledgeGroups({ items }: { items: AttachedItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {GROUPS.map(({ group, label }) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) {
          return null;
        }
        return (
          <div key={group} className="flex items-start gap-2">
            {/* Fixed width so the chip columns line up across groups. */}
            <span className="w-24 shrink-0 py-1 heading-xs text-muted-foreground">
              {label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {groupItems.map((item) => (
                <Chip
                  key={item.id}
                  label={item.name}
                  icon={item.icon}
                  color="primary"
                  className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150"
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
