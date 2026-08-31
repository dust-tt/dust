import { getConversationRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import { ArrowLeft, Button } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface AppBuilderShellProps {
  owner: LightWorkspaceType;
  /** Rendered in the header next to the back button — the App's name, and its actions. */
  header?: ReactNode;
  children: ReactNode;
}

/**
 * The App builder takes over the whole screen: it renders outside `AppContentLayout`, so it carries
 * its own thin header whose only fixed element is the way back to the rest of Dust.
 */
export function AppBuilderShell({
  owner,
  header,
  children,
}: AppBuilderShellProps) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-muted-background dark:bg-muted-background-night">
      <div className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-border px-3 dark:border-border-night">
        <Button
          size="xs"
          variant="ghost"
          icon={ArrowLeft}
          tooltip="Back to Dust"
          href={getConversationRoute(owner.sId)}
        />
        {header}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
