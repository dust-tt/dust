import { Page, Spinner } from "@dust-tt/sparkle";
import React, { useEffect } from "react";

import { SpaceJournalEntry } from "@app/components/assistant/conversation/space/conversations/SpaceJournalEntry";
import { CreateOrEditSpaceModal } from "@app/components/spaces/CreateOrEditSpaceModal";
import { SpaceCategoriesList } from "@app/components/spaces/SpaceCategoriesList";
import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
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
    canWriteInSpace,
    canReadInSpace,
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

  const pageProps: SpaceLayoutPageProps = {
    canReadInSpace,
    canWriteInSpace,
    isAdmin,
    owner,
    plan,
    space,
    subscription,
  };

  return (
    <SpaceLayout pageProps={pageProps} useBackendSearch>
      <Page.Vertical gap="xl" align="stretch">
        <SpaceJournalEntry owner={owner} space={space} />
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
    </SpaceLayout>
  );
}
