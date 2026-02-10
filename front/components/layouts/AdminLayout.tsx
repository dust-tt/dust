import { cn } from "@dust-tt/sparkle";
import type { ReactElement } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { useAppLayoutConfig } from "@app/components/sparkle/AppLayoutContext";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

interface AdminLayoutProps {
  children: ReactElement;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const owner = useWorkspace();

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const router = useAppRouter();

  useAppLayoutConfig(
    () => ({
      subNavigation: subNavigationAdmin({
        owner,
        currentRoute: router.pathname,
        featureFlags,
      }),
    }),
    [owner.sId, router.pathname, featureFlags]
  );

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center overflow-y-auto pt-4"
      )}
    >
      <div className="flex w-full max-w-4xl grow flex-col px-4 sm:px-8">
        {children}
      </div>
    </div>
  );
}
