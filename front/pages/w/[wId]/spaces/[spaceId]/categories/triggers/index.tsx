import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { SpaceTriggersList } from "@app/components/spaces/SpaceTriggersList";
import { SystemSpaceTriggersList } from "@app/components/spaces/SystemSpaceTriggersList";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { DataSourceViewCategory, SpaceType, UserType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<
  SpaceLayoutPageProps & {
    category: DataSourceViewCategory;
    isAdmin: boolean;
    user: UserType;
    space: SpaceType;
  }
>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();
  const subscription = auth.subscription();
  const plan = auth.getNonNullablePlan();
  const isAdmin = auth.isAdmin();

  const { spaceId } = context.query;

  if (!subscription || typeof spaceId !== "string") {
    return {
      notFound: true,
    };
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (space === null || !space.canReadOrAdministrate(auth)) {
    return {
      notFound: true,
    };
  }

  const isBuilder = auth.isBuilder();
  const canWriteInSpace = space.canWrite(auth);

  return {
    props: {
      canReadInSpace: space.canRead(auth),
      canWriteInSpace,
      category: "triggers",
      isAdmin,
      isBuilder,
      owner,
      user: user.toJSON(),
      plan,
      space: space.toJSON(),
      subscription,
    },
  };
});

export default function Space({
  isAdmin,
  owner,
  space,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
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

Space.getLayout = (page: ReactElement, pageProps: any) => {
  return (
    <AppRootLayout>
      <SpaceLayout pageProps={pageProps}>{page}</SpaceLayout>
    </AppRootLayout>
  );
};
