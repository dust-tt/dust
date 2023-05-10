import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";

export const getServerSideProps: GetServerSideProps<{}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return {
      notFound: true,
    };
  }

  if (owner.role === "user") {
    return {
      redirect: {
        destination: `/w/${context.query.wId}/u`,
        permanent: false,
      },
    };
  }
  return {
    redirect: {
      destination: `/w/${context.query.wId}/a`,
      permanent: false,
    },
  };
};

export default function Redirect({}: InferGetServerSidePropsType<
  typeof getServerSideProps
>) {
  return <></>;
}
