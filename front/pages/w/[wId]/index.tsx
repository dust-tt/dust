import { GetServerSideProps } from "next";

import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { getDataSources } from "@app/lib/api/data_sources";

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

  // check if upsertable data sources using getDataSources
  let dataSources = (await getDataSources(auth)).filter(
    (ds) => ds.userUpsertable
  );
  if (owner.role === "user" && dataSources.length) {
    return {
      redirect: {
        destination: `/w/${context.query.wId}/ds`,
        permanent: false,
      },
    };
  }
  if (owner.role !== "user") {
    return {
      redirect: {
        destination: `/w/${context.query.wId}/a`,
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
