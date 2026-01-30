import { Spinner } from "@dust-tt/sparkle";

import { SpaceAppsList } from "@app/components/spaces/SpaceAppsList";
import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";

export function SpaceAppsListPage() {
  const router = useAppRouter();
  const spaceId = useRequiredPathParam("spaceId");
  const owner = useWorkspace();
  const { subscription, isAdmin, isBuilder } = useAuth();
  const plan = subscription.plan;

  const {
    spaceInfo: space,
    canWriteInSpace,
    canReadInSpace,
    isSpaceInfoLoading,
  } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
  });

  if (isSpaceInfoLoading || !space) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const pageProps: SpaceLayoutPageProps = {
    canReadInSpace,
    canWriteInSpace,
    category: "apps",
    isAdmin,
    owner,
    plan,
    space,
    subscription,
  };

  return (
    <SpaceLayout pageProps={pageProps}>
      <SpaceAppsList
        owner={owner}
        space={space}
        isBuilder={isBuilder}
        onSelect={(sId) => {
          void router.push(`/w/${owner.sId}/spaces/${space.sId}/apps/${sId}`);
        }}
      />
    </SpaceLayout>
  );
}
