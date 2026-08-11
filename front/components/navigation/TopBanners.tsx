import { StatusBanners } from "@app/components/navigation/AppStatusBanner";
import { SubscriptionEndBanner } from "@app/components/navigation/TrialBanner";
import type { SubscriptionType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import { cn } from "@dust-tt/sparkle";
import { useCallback, useRef } from "react";

interface TopBannersProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
}

export function TopBanners({ owner, subscription }: TopBannersProps) {
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const setNode = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;

    if (!node) {
      document.documentElement.style.setProperty("--banner-height", "0px");
      return;
    }

    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty(
        "--banner-height",
        `${node.offsetHeight}px`
      );
    });
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);

  return (
    <div
      ref={setNode}
      className={cn(
        "sticky top-0 z-50 shrink-0",
        "flex flex-col",
        "pb-2 empty:hidden",
        "bg-app-background"
      )}
    >
      <SubscriptionEndBanner
        isAdmin={isAdmin(owner)}
        owner={owner}
        subscription={subscription}
      />
      <StatusBanners />
    </div>
  );
}
