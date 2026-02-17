import { Notification } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface PlaygroundScreenProps {
  children: ReactNode;
}

/**
 * Reusable playground layout: Notification.Area wrapping the main content.
 * Use this to wrap any playground story content for toast support.
 */
export function PlaygroundScreen({ children }: PlaygroundScreenProps) {
  return (
    <div className="s-flex s-h-screen s-w-full s-flex-col s-overflow-hidden s-bg-background">
      <div className="s-min-h-0 s-flex-1 s-overflow-y-auto">
        <Notification.Area>{children}</Notification.Area>
      </div>
    </div>
  );
}
