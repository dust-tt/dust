import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React from "react";

import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ExtractEventSchemaForm } from "@app/pages/w/[wId]/u/extract/_shared_schema_form";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;
export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );
  const owner = auth.workspace();
  if (!owner || !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AppExtractEventsCreate({
  user,
  owner,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <ExtractEventSchemaForm
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
    />
  );
}
