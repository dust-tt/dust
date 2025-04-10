import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { getPersistedNavigationSelection } from "@app/lib/persisted_navigation_selection";
import { SpaceResource } from "@app/lib/resources/space_resource";

// This endpoint is used as a pass through to redirect to the global space.
export const getServerSideProps = withDefaultUserAuthRequirements(
  async (context, auth) => {
    const owner = auth.getNonNullableWorkspace();
    const subscription = auth.subscription();

    if (!subscription) {
      return {
        notFound: true,
      };
    }

    // Try to go to the last selected space.
    const selection = await getPersistedNavigationSelection(
      auth.getNonNullableUser()
    );
    if (selection.lastSpaceId) {
      return {
        redirect: {
          destination: `/w/${owner.sId}/spaces/${selection.lastSpaceId}`,
          permanent: false,
        },
      };
    }

    // Fall back to the global space.
    const space = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    if (!space) {
      return {
        notFound: true,
      };
    }

    return {
      redirect: {
        destination: `/w/${owner.sId}/spaces/${space.sId}`,
        permanent: false,
      },
    };
  }
);

export default function DefaultSpace() {}
