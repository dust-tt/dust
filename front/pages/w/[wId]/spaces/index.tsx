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
      const space = await SpaceResource.fetchById(auth, selection.lastSpaceId);
      if (space && space.canReadOrAdministrate(auth)) {
        return {
          redirect: {
            destination: `/w/${owner.sId}/spaces/${space.sId}`,
            permanent: false,
          },
        };
      }
    }

    if (owner.role === "admin") {
      // Fall back to the system space (connection admin).
      const space = await SpaceResource.fetchWorkspaceSystemSpace(auth);

      return {
        redirect: {
          destination: `/w/${owner.sId}/spaces/${space.sId}`,
          permanent: false,
        },
      };
    } else {
      // Fall back to the global space (company data).
      const space = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

      return {
        redirect: {
          destination: `/w/${owner.sId}/spaces/${space.sId}`,
          permanent: false,
        },
      };
    }
  }
);

export default function DefaultSpace() {}
