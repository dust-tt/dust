import { Authenticator } from "@app/lib/auth";
import { withDefaultGetServerSidePropsRequirements } from "@app/lib/iam/session";

export const getServerSideProps =
  withDefaultGetServerSidePropsRequirements<object>(
    async (context, session) => {
      const auth = await Authenticator.fromSession(
        session,
        context.params?.wId as string
      );

      if (!auth.workspace() || !auth.user()) {
        return {
          notFound: true,
        };
      }

      return {
        redirect: {
          destination: `/w/${context.query.wId}/assistant/new`,
          permanent: false,
        },
      };
    }
  );

export default function Redirect() {
  return <></>;
}
