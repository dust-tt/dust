import { Spinner } from "@dust-tt/sparkle";

import { SpaceActionsList } from "@app/components/spaces/SpaceActionsList";
import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { SystemSpaceActionsList } from "@app/components/spaces/SystemSpaceActionsList";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";

export function SpaceActionsPage() {
  const spaceId = useRequiredPathParam("spaceId");
  const owner = useWorkspace();
  const { subscription, isAdmin, user } = useAuth();
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

  if (isSpaceInfoLoading || !space || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const pageProps: SpaceLayoutPageProps = {
    canReadInSpace,
    canWriteInSpace,
    category: "actions",
    isAdmin,
    owner,
    plan,
    space,
    subscription,
  };

  return (
    <SpaceLayout pageProps={pageProps}>
      {space.kind === "system" ? (
        <SystemSpaceActionsList
          isAdmin={isAdmin}
          owner={owner}
          user={user}
          space={space}
        />
      ) : (
        <SpaceActionsList isAdmin={isAdmin} owner={owner} space={space} />
      )}
    </SpaceLayout>
  );
}
