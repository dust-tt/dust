import { subNavigationAdmin } from "@app/components/navigation/config";
import { useSetSubNavigation } from "@app/components/sparkle/AppLayoutContext";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { cn } from "@dust-tt/sparkle";
import type { ReactElement } from "react";
import { useMemo } from "react";

interface AdminLayoutProps {
  children: ReactElement;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const owner = useWorkspace();
  const { subscription, canViewWorkspaceConsumptionAnalytics } = useAuth();

  const { featureFlags } = useFeatureFlags();
  const { hasPermission } = useWorkspacePermissions();

  const router = useAppRouter();

  const subNavigation = useMemo(
    () =>
      subNavigationAdmin({
        owner,
        currentRoute: router.pathname,
        featureFlags,
        subscription,
        hasPermission,
        canViewWorkspaceConsumptionAnalytics,
      }),
    [
      owner,
      router.pathname,
      featureFlags,
      subscription,
      hasPermission,
      canViewWorkspaceConsumptionAnalytics,
    ]
  );

  useSetSubNavigation(subNavigation);

  return (
    <div
      className={cn("flex h-full w-full flex-col items-center pt-4 sm:pt-8")}
    >
      <div className="flex w-full max-w-6xl grow flex-col px-4 sm:px-10 pb-4 sm:pb-8">
        {children}
      </div>
    </div>
  );
}
