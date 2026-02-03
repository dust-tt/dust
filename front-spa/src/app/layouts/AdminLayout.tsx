import { subNavigationAdmin } from "@dust-tt/front/components/navigation/config";
import AppContentLayout from "@dust-tt/front/components/sparkle/AppContentLayout";
import { useAuth, useWorkspace } from "@dust-tt/front/lib/auth/AuthContext";
import { useAppRouter } from "@dust-tt/front/lib/platform";
import { useFeatureFlags } from "@dust-tt/front/lib/swr/workspaces";
import { cn } from "@dust-tt/sparkle";
import { Outlet } from "react-router-dom";

export function AdminLayout() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const { params } = useAppRouter();
  console.log(params);

  const subNavigation = subNavigationAdmin({
    owner,
    current: "members",
    featureFlags,
  });

  return (
    <AppContentLayout subNavigation={subNavigation} subscription={subscription} owner={owner}>
      <div
        className={cn(
          "flex w-full h-full flex-col items-center overflow-y-auto pt-4",
        )}
      >
        <div className="flex w-full max-w-4xl grow flex-col px-4 sm:px-8">
          <Outlet />
        </div>
      </div>
    </AppContentLayout>
  );
}