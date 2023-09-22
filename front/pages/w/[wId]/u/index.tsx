import { GetServerSideProps } from "next";

import { getSession, getUserFromSession } from "@app/lib/auth";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  if (!user) {
    return {
      notFound: true,
    };
  }

  return {
    redirect: {
      destination: `/w/${context.query.wId}/u/chat`,
      permanent: false,
    },
  };
};

export default function Redirect() {
  return <></>;
}
