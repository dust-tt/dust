import { GetServerSideProps } from "next";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context.req, context.res);
  await getUserFromSession(session);
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
        destination: `/w/${context.query.wId}/ds`,
        permanent: false,
      },
    };
  }
  return {
    redirect: {
      destination: `/w/${context.query.wId}/u`,
      permanent: false,
    },
  };
};

export default function Redirect() {
  return <></>;
}
