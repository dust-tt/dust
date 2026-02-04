import { Page, Spinner } from "@dust-tt/sparkle";
import React, { useEffect } from "react";

import { CreateOrEditSpaceModal } from "@app/components/spaces/CreateOrEditSpaceModal";
import { SpaceCategoriesList } from "@app/components/spaces/SpaceCategoriesList";
import { SpaceSearchInput } from "@app/components/spaces/SpaceSearchLayout";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";

export function SpacePage() {
  const [showSpaceEditionModal, setShowSpaceEditionModal] =
    React.useState(false);

  const router = useAppRouter();
  const spaceId = useRequiredPathParam("spaceId");
  const owner = useWorkspace();
  const { subscription, isAdmin, isBuilder } = useAuth();
  const plan = subscription.plan;

  const {
    spaceInfo: space,
    canReadInSpace,
    canWriteInSpace,
    isSpaceInfoLoading,
  } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
  });

  // Redirect system spaces to managed category
  useEffect(() => {
    if (space && space.kind === "system") {
      void router.replace(
        `/w/${owner.sId}/spaces/${space.sId}/categories/managed`
      );
    }
  }, [space, owner.sId, router]);

  if (isSpaceInfoLoading || !space) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Don't render if system space (redirect is happening)
  if (space.kind === "system") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <SpaceSearchInput
      category={undefined}
      canReadInSpace={canReadInSpace}
      canWriteInSpace={canWriteInSpace}
      owner={owner}
      space={space}
      dataSourceView={undefined}
      parentId={undefined}
      useBackendSearch
    >
      <Page.Vertical gap="xl" align="stretch">
        <SpaceCategoriesList
          owner={owner}
          canWriteInSpace={canWriteInSpace}
          space={space}
          onSelect={(category) => {
            void router.push(
              `/w/${owner.sId}/spaces/${space.sId}/categories/${category}`
            );
          }}
          isAdmin={isAdmin}
          isBuilder={isBuilder}
          onButtonClick={() => setShowSpaceEditionModal(true)}
        />
        <CreateOrEditSpaceModal
          owner={owner}
          isOpen={showSpaceEditionModal}
          onClose={() => setShowSpaceEditionModal(false)}
          space={space}
          isAdmin={isAdmin}
          plan={plan}
        />
      </Page.Vertical>
    </SpaceSearchInput>
  );
}
