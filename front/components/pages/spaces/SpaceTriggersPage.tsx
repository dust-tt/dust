import { Spinner } from "@dust-tt/sparkle";

import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { SpaceTriggersList } from "@app/components/spaces/SpaceTriggersList";
import { SystemSpaceTriggersList } from "@app/components/spaces/SystemSpaceTriggersList";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";

export function SpaceTriggersPage() {
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
    category: "triggers",
    isAdmin,
    owner,
    plan,
    space,
    subscription,
  };

  const content =
    space.kind === "system" ? (
      <SystemSpaceTriggersList
        isAdmin={isAdmin}
        owner={owner}
        space={space}
        user={user}
      />
    ) : (
      <SpaceTriggersList owner={owner} space={space} />
    );

  return <SpaceLayout pageProps={pageProps}>{content}</SpaceLayout>;
}
