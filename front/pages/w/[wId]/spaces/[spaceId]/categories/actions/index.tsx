import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { SpaceActionsList } from "@app/components/spaces/SpaceActionsList";
import type { SpaceLayoutPageProps } from "@app/components/spaces/SpaceLayout";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { SystemSpaceActionsList } from "@app/components/spaces/SystemSpaceActionsList";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
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

  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || !systemSpace || !space.canReadOrAdministrate(auth)) {
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
      category: "actions",
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
  user,
  space,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
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

Space.getLayout = (page: ReactElement, pageProps: any) => {
  return (
    <AppRootLayout>
      <SpaceLayout pageProps={pageProps}>{page}</SpaceLayout>
    </AppRootLayout>
  );
};
