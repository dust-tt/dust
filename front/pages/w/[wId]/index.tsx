import type { GetServerSideProps } from "next";

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

  return {
    redirect: {
      destination: `/w/${context.query.wId}/assistant/new`,
      permanent: false,
    },
  };
};

export default function Redirect() {
  return <></>;
}
