import { subNavigationAdmin } from "@app/components/navigation/config";
import { useSetSubNavigation } from "@app/components/sparkle/AppLayoutContext";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { cn } from "@dust-tt/sparkle";
import type { ReactElement } from "react";
import { useMemo } from "react";

interface AdminLayoutProps {
  children: ReactElement;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const owner = useWorkspace();

  const { featureFlags } = useFeatureFlags();

  const router = useAppRouter();

  const subNavigation = useMemo(
    () =>
      subNavigationAdmin({
        owner,
        currentRoute: router.pathname,
        featureFlags,
      }),
    [owner, router.pathname, featureFlags]
  );

  useSetSubNavigation(subNavigation);

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center overflow-y-auto pt-4"
      )}
    >
      <div className="flex w-full max-w-6xl grow flex-col px-4 sm:px-8">
        {children}
      </div>
    </div>
  );
}
