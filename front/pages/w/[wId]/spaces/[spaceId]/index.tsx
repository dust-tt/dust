import { Chip, InformationCircleIcon, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import React from "react";

import { CreateOrEditSpaceModal } from "@app/components/spaces/CreateOrEditSpaceModal";
import { SpaceCategoriesList } from "@app/components/spaces/SpaceCategoriesList";
import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import AppHeadLayout from "@app/components/sparkle/AppHeadLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { useSpaceInfo } from "@app/lib/swr/spaces";

export const getServerSideProps = withDefaultUserAuthRequirements<
  SpaceLayoutPageProps & { userId: string; canWriteInSpace: boolean }
>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const isAdmin = auth.isAdmin();
  const plan = auth.getNonNullablePlan();

  const { spaceId } = context.query;
  if (!subscription || typeof spaceId !== "string") {
    return {
      notFound: true,
    };
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || !space.canReadOrAdministrate(auth)) {
    return {
      notFound: true,
    };
  }

  // No root page for System spaces since it contains only managed data sources.
  if (space.isSystem()) {
    return {
      redirect: {
        destination: `/w/${owner.sId}/spaces/${space.sId}/categories/managed`,
        permanent: false,
      },
    };
  }

  const canWriteInSpace = space.canWrite(auth);

  return {
    props: {
      canReadInSpace: space.canRead(auth),
      canWriteInSpace,
      isAdmin,
      owner,
      plan,
      space: space.toJSON(),
      subscription,
      userId: auth.getNonNullableUser().sId,
    },
  };
});

export default function Space({
  isAdmin,
  canWriteInSpace,
  owner,
  userId,
  space,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [showSpaceEditionModal, setShowSpaceEditionModal] =
    React.useState(false);

  const { spaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });

  const router = useRouter();

  const isMember = React.useMemo(
    () => spaceInfo?.members?.some((m) => m.sId === userId),
    [userId, spaceInfo?.members]
  );

  return (
    <Page.Vertical gap="xl" align="stretch">
      {spaceInfo && !isMember && (
        <div>
          {/* TODO: Should we move this to the SpaceLayout? */}
          <Chip
            color="rose"
            label="You are not a member of this space."
            size="sm"
            icon={InformationCircleIcon}
          />
        </div>
      )}
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
        onButtonClick={() => setShowSpaceEditionModal(true)}
      />
      <CreateOrEditSpaceModal
        owner={owner}
        isOpen={showSpaceEditionModal}
        onClose={() => setShowSpaceEditionModal(false)}
        space={space}
        isAdmin={isAdmin}
      />
    </Page.Vertical>
  );
}

Space.getLayout = (page: ReactElement, pageProps: any) => {
  return (
    <AppHeadLayout>
      <SpaceLayout pageProps={pageProps} useBackendSearch>
        {page}
      </SpaceLayout>
    </AppHeadLayout>
  );
};
