import { GetServerSideProps } from "next";

import { isOnAssistantV2 } from "@app/lib/assistant";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !user) {
    return {
      notFound: true,
    };
  }

  const isOnV2 = isOnAssistantV2(owner);
  const redirectRoute = isOnV2
    ? `/w/${context.query.wId}/assistant/new`
    : `/w/${context.query.wId}/u/chat`;

  return {
    redirect: {
      destination: redirectRoute,
      permanent: false,
    },
  };
};

export default function Redirect() {
  return <></>;
}
