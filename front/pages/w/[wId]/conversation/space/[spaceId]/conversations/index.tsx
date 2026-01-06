import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";
import React from "react";

import { ConversationContainerVirtuoso } from "@app/components/assistant/conversation/ConversationContainer";
import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import { ConversationLayout } from "@app/components/assistant/conversation/ConversationLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useActiveSpaceId } from "@app/hooks/useActiveSpaceId";

import { getSpaceServerSideProps } from "../getServerSideProps";
import { SpaceTabsWrapper } from "../SpaceDetailsWrapper";
import { SpaceConversationsTab } from "./SpaceConversationsTab";

export const getServerSideProps = getSpaceServerSideProps;

export default function SpaceConversations({
  owner,
  subscription,
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const spaceId = useActiveSpaceId();
  const activeConversationId = useActiveConversationId();

  if (activeConversationId) {
    return (
      <ConversationContainerVirtuoso
        owner={owner}
        subscription={subscription}
        user={user}
      />
    );
  }

  return (
    <SpaceTabsWrapper owner={owner} spaceId={spaceId}>
      <SpaceConversationsTab owner={owner} user={user} spaceId={spaceId} />
    </SpaceTabsWrapper>
  );
}

SpaceConversations.getLayout = (
  page: ReactElement,
  pageProps: ConversationLayoutProps
) => {
  return (
    <AppRootLayout>
      <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>
    </AppRootLayout>
  );
};
