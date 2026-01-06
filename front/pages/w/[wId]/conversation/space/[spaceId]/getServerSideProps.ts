import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SpaceResource } from "@app/lib/resources/space_resource";

export const getSpaceServerSideProps =
  withDefaultUserAuthRequirements<ConversationLayoutProps>(
    async (context, auth) => {
      const owner = auth.workspace();
      const user = auth.user()?.toJSON();
      const subscription = auth.subscription();
      const isAdmin = auth.isAdmin();

      if (!owner || !user || !auth.isUser() || !subscription) {
        return {
          redirect: {
            destination: "/",
            permanent: false,
          },
        };
      }

      const { spaceId } = context.params;
      if (typeof spaceId !== "string") {
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

      return {
        props: {
          user,
          owner,
          isAdmin,
          subscription,
          baseUrl: config.getClientFacingUrl(),
          conversationId: null,
        },
      };
    }
  );
