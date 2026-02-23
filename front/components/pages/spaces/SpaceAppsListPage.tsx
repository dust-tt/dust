import { SpaceAppsList } from "@app/components/spaces/SpaceAppsList";
import { SpaceSearchInput } from "@app/components/spaces/SpaceSearchLayout";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { Spinner } from "@dust-tt/sparkle";

export function SpaceAppsListPage() {
  const router = useAppRouter();
  const spaceId = useRequiredPathParam("spaceId");
  const owner = useWorkspace();
  const { isBuilder } = useAuth();

  const {
    spaceInfo: space,
    canReadInSpace,
    canWriteInSpace,
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

  return (
    <SpaceSearchInput
      category="apps"
      canReadInSpace={canReadInSpace}
      canWriteInSpace={canWriteInSpace}
      owner={owner}
      space={space}
      dataSourceView={undefined}
      parentId={undefined}
    >
      <SpaceAppsList
        owner={owner}
        space={space}
        isBuilder={isBuilder}
        onSelect={(sId) => {
          void router.push(`/w/${owner.sId}/spaces/${space.sId}/apps/${sId}`);
        }}
      />
    </SpaceSearchInput>
  );
}
