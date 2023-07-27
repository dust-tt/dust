import { GetServerSideProps } from "next";

import { newChatSessionId } from "@app/lib/api/chat";
import { setUserMetadata } from "@app/lib/api/user";
import { getSession, getUserFromSession } from "@app/lib/auth";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context.req, context.res);

  const user = await getUserFromSession(session);
  if (!user) {
    return {
      notFound: true,
    };
  }

  void setUserMetadata(user, {
    key: "sticky_path",
    value: `/w/${context.query.wId}/u/chat`,
  });

  const cId = newChatSessionId();
  return {
    redirect: {
      destination: `/w/${context.query.wId}/u/chat/${cId}`,
      permanent: false,
    },
  };
};

export default function Redirect() {
  return <></>;
}
