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
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Notification.Area>{children}</Notification.Area>
      </div>
    </div>
  );
}
