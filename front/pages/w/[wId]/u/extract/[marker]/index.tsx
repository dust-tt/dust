import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React from "react";

import { getEventSchema } from "@app/lib/api/extract";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ExtractEventSchemaForm } from "@app/pages/w/[wId]/u/extract/_shared_schema_form";
import { EventSchemaType } from "@app/types/extract";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;
export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  schema: EventSchemaType;
  readOnly: boolean;
  gaTrackingId: string;
}> = async (context) => {
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

  const schema = await getEventSchema(auth, context.params?.marker as string);
  if (!schema) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      schema,
      readOnly: !auth.isBuilder(),
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AppExtractEventsUpdate({
  user,
  owner,
  schema,
  readOnly,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <ExtractEventSchemaForm
      user={user}
      owner={owner}
      schema={schema}
      readOnly={readOnly}
      gaTrackingId={gaTrackingId}
    />
  );
}
