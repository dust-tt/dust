import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { ConversationPage } from "@app/components/poke/pages/ConversationPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type { LightWorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  conversationId: string;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { wId, cId } = context.params ?? {};
  if (!isString(wId) || !isString(cId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      conversationId: cId,
    },
  };
});

export default function ConversationPageNextJS({
  owner,
  conversationId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <ConversationPage owner={owner} conversationId={conversationId} />;
}

ConversationPageNextJS.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - Conversation`}>{page}</PokeLayout>;
};
