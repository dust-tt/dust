import { Avatar, Icon } from "@dust-tt/sparkle";
import type { DragEvent } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import type { AvatarData } from "../data/types";

/**
 * What the pointer carries during a drag: a small chip with the icon and the
 * name, rather than a copy of the row it came from. A whole table row or nav
 * row under the cursor hides the thing it is being dropped on.
 */
export function setDragPreview(
  event: DragEvent<HTMLElement>,
  {
    label,
    icon,
    avatar,
  }: {
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    avatar?: AvatarData;
  }
): void {
  const host = document.createElement("div");
  // Off-screen rather than hidden: the browser only snapshots what it lays out.
  host.style.position = "fixed";
  host.style.top = "-1000px";
  host.style.left = "-1000px";
  host.style.pointerEvents = "none";
  document.body.append(host);

  const root = createRoot(host);
  // The snapshot is taken the moment `setDragImage` is called, so the chip has
  // to be in the DOM by then rather than after React's next render.
  flushSync(() =>
    root.render(
      <div className="inline-flex max-w-56 items-center gap-1.5 rounded-lg border border-border bg-overlay-background px-2.5 py-1.5 text-sm text-foreground shadow-md">
        {avatar ? (
          <Avatar size="xxs" {...avatar} />
        ) : (
          icon && <Icon visual={icon} size="xs" />
        )}
        <span className="truncate">{label}</span>
      </div>
    )
  );

  event.dataTransfer.setDragImage(host, 12, 12);

  // The snapshot is already taken, so the chip has served its purpose.
  setTimeout(() => {
    root.unmount();
    host.remove();
  }, 0);
}
