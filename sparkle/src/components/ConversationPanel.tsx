import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";

export interface ConversationPanelProps {
  children: ReactNode;
  /** Content of the sticky header, e.g. a title and a close button. */
  header: ReactNode;
  className?: string;
}

/**
 * Full-height surface with a sticky **header** slot above a **children** body
 * that fills the remaining space.
 *
 * @example
 * ```tsx
 * <ConversationPanel header={<MyPanelHeader onClose={onClose} />}>
 *   <ConversationViewer ... />
 * </ConversationPanel>
 * ```
 */
export function ConversationPanel({
  children,
  header,
  className,
}: ConversationPanelProps) {
  return (
    <div
      className={cn("flex h-full w-full flex-col overflow-hidden", className)}
    >
      <div
        className={cn(
          "sticky top-0 z-10 flex items-center",
          "border-b border-border",
          "bg-panel-background/80 backdrop-blur-sm"
        )}
      >
        {header}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
