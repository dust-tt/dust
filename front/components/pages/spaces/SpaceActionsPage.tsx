import { Spinner } from "@dust-tt/sparkle";

import { SpaceActionsList } from "@app/components/spaces/SpaceActionsList";
import { SystemSpaceActionsList } from "@app/components/spaces/SystemSpaceActionsList";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";

export function SpaceActionsPage() {
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
      <SystemSpaceActionsList
        isAdmin={isAdmin}
        owner={owner}
        user={user}
        space={space}
      />
    );
  }

  return <SpaceActionsList isAdmin={isAdmin} owner={owner} space={space} />;
}
