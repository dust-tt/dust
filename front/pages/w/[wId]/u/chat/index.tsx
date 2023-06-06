import { GetServerSideProps } from "next";

import { newChatSessionId } from "@app/lib/api/chat";

export const getServerSideProps: GetServerSideProps = async (context) => {
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
