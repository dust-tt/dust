import { GetServerSideProps } from "next";

import { setUserMetadata } from "@app/lib/api/user";
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

  if (owner.role === "user") {
    void setUserMetadata(user, {
      key: "sticky_path",
      value: `/w/${context.query.wId}/u`,
    });
    return {
      redirect: {
        destination: `/w/${context.query.wId}/u`,
        permanent: false,
      },
    };
  }

  void setUserMetadata(user, {
    key: "sticky_path",
    value: `/w/${context.query.wId}/a`,
  });
  return {
    redirect: {
      destination: `/w/${context.query.wId}/a`,
      permanent: false,
    },
  };
};

export default function Redirect() {
  return <></>;
}
