import { Spinner } from "@dust-tt/sparkle";

import { SpaceTriggersList } from "@app/components/spaces/SpaceTriggersList";
import { SystemSpaceTriggersList } from "@app/components/spaces/SystemSpaceTriggersList";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";

export function SpaceTriggersPage() {
  const spaceId = useRequiredPathParam("spaceId");
  const owner = useWorkspace();
  const { isAdmin, user } = useAuth();

  const { spaceInfo: space, isSpaceInfoLoading } = useSpaceInfo({
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

  if (space.kind === "system") {
    return (
      <SystemSpaceTriggersList
        isAdmin={isAdmin}
        owner={owner}
        space={space}
        user={user}
      />
    );
  }

  return <SpaceTriggersList owner={owner} space={space} />;
}
