import { SpaceSearchInput } from "@app/components/spaces/SpaceSearchLayout";
import { SpaceTriggersList } from "@app/components/spaces/SpaceTriggersList";
import { SystemSpaceTriggersList } from "@app/components/spaces/SystemSpaceTriggersList";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { Spinner } from "@dust-tt/sparkle";

export function SpaceTriggersPage() {
  const spaceId = useRequiredPathParam("spaceId");
  const owner = useWorkspace();
  const { isAdmin, user } = useAuth();

  const {
    spaceInfo: space,
    canReadInSpace,
    canWriteInSpace,
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

  return (
    <SpaceSearchInput
      category="triggers"
      canReadInSpace={canReadInSpace}
      canWriteInSpace={canWriteInSpace}
      owner={owner}
      space={space}
      dataSourceView={undefined}
      parentId={undefined}
    >
      {content}
    </SpaceSearchInput>
  );
}
