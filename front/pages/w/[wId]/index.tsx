import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { getConversationRoute } from "@app/lib/utils/router";

export const getServerSideProps = withDefaultUserAuthRequirements<object>(
  async (context, auth) => {
    if (!auth.workspace() || !auth.user()) {
      return {
        notFound: true,
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
