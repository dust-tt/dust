import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getConversationRoute } from "@app/lib/utils/router";

export const getServerSideProps = withDefaultUserAuthRequirements<object>(
  async (context, auth) => {
    if (!auth.workspace() || !auth.user()) {
      return {
        notFound: true,
      };
    }

    const owner = auth.getNonNullableWorkspace();

    // Handle configureSlack redirect - redirect to system space managed page (admin only).
    if (context.query.goto === "configureSlack" && auth.isAdmin()) {
      const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
      return {
        redirect: {
          destination: `/w/${owner.sId}/spaces/${systemSpace.sId}/categories/managed?configureConnection=slack`,
          permanent: false,
        },
      };
    }

    return {
      redirect: {
        destination: getConversationRoute(context.query.wId as string),
        permanent: false,
      },
    };
  }
);

export default function Redirect() {
  return <></>;
}
