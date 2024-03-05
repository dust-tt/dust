import { Authenticator, getSession } from "@app/lib/auth";
import { withGetServerSidePropsRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withGetServerSidePropsRequirements<object>(
  async (context) => {
    const session = await getSession(context.req, context.res);
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
