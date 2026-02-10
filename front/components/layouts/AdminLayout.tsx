import { cn } from "@dust-tt/sparkle";
import type { ReactElement } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppContentLayout } from "@app/components/sparkle/AppContentLayout";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

interface AdminLayoutProps {
  children: ReactElement;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const router = useAppRouter();

  const subNavigation = subNavigationAdmin({
    owner,
    currentRoute: router.pathname,
    featureFlags,
  });

  return (
    <AppContentLayout
      subNavigation={subNavigation}
      subscription={subscription}
      owner={owner}
    >
      <div
        className={cn(
          "flex h-full w-full flex-col items-center overflow-y-auto pt-4"
        )}
      >
        <div className="flex w-full max-w-4xl grow flex-col px-4 sm:px-8">
          {children}
        </div>
      </div>
    </AppContentLayout>
  );
}
