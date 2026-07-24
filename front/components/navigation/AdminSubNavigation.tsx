import { subNavigationAdmin } from "@app/components/navigation/config";
import { useSetSubNavigation } from "@app/components/sparkle/AppLayoutContext";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import type { ReactNode } from "react";
import { useMemo } from "react";

interface AdminSubNavigationProps {
  children: ReactNode;
}

/**
 * Registers the admin sidebar sub-navigation for the admin route cluster.
 * Mounted once by front-spa's RequireRoleLayout; unregisters on unmount via
 * the setter hook's cleanup. Layout (width/gutters) is NOT decided here —
 * each admin page declares its own archetype with useSetContentWidth
 * (design_docs/LAYOUT_SYSTEM.md §3.4).
 */
export function AdminSubNavigation({ children }: AdminSubNavigationProps) {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const router = useAppRouter();

  const subNavigation = useMemo(
    () =>
      subNavigationAdmin({
        owner,
        currentRoute: router.pathname,
        featureFlags,
        subscription,
      }),
    [owner, router.pathname, featureFlags, subscription]
  );

  useSetSubNavigation(subNavigation);

  return <>{children}</>;
}
