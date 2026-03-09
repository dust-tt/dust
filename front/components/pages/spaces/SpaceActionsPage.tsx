import { SpaceActionsList } from "@app/components/spaces/SpaceActionsList";
import { SpaceSearchInput } from "@app/components/spaces/SpaceSearchLayout";
import { SystemSpaceActionsList } from "@app/components/spaces/SystemSpaceActionsList";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { Spinner } from "@dust-tt/sparkle";

export function SpaceActionsPage() {
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
      <SystemSpaceActionsList
        isAdmin={isAdmin}
        owner={owner}
        user={user}
        space={space}
      />
    ) : (
      <SpaceActionsList isAdmin={isAdmin} owner={owner} space={space} />
    );

  return (
    <SpaceSearchInput
      category="actions"
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
