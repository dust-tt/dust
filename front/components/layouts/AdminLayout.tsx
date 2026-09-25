import { subNavigationAdmin } from "@app/components/navigation/config";
import { useSetSubNavigation } from "@app/components/sparkle/AppLayoutContext";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import type { ReactElement } from "react";
import { useMemo } from "react";

interface AdminLayoutProps {
  children: ReactElement;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const owner = useWorkspace();
  const { subscription, groupUsageScope } = useAuth();

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
        canManageUsage:
          featureFlags.includes("group_management") &&
          !!groupUsageScope?.readGroupIds.length,
      }),
    [
      owner,
      router.pathname,
      featureFlags,
      subscription,
      hasPermission,
      groupUsageScope,
    ]
  );

  useSetSubNavigation(subNavigation);

  return children;
}
