import { subNavigationAdmin } from "@app/components/navigation/config";
import { useSetSubNavigation } from "@app/components/sparkle/AppLayoutContext";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { hasGroupManagementScope } from "@app/types/api/auth_context";
import { useLingui } from "@lingui/react/macro";
import type { ReactElement } from "react";
import { useMemo } from "react";

interface AdminLayoutProps {
  children: ReactElement;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { t } = useLingui();
  const owner = useWorkspace();
  const { subscription, groupManagement } = useAuth();

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
        hasManagedGroups: hasGroupManagementScope(groupManagement?.read_usage),
        t,
      }),
    [
      owner,
      router.pathname,
      featureFlags,
      subscription,
      hasPermission,
      groupManagement,
      t,
    ]
  );

  useSetSubNavigation(subNavigation);

  return children;
}
