import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";
import React from "react";

import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import { ConversationLayout } from "@app/components/assistant/conversation/ConversationLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useActiveSpaceId } from "@app/hooks/useActiveSpaceId";

import { getSpaceServerSideProps } from "../getServerSideProps";
import { SpaceTabsWrapper } from "../SpaceDetailsWrapper";

export const getServerSideProps = getSpaceServerSideProps;

export default function SpaceTools({
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const spaceId = useActiveSpaceId();

  return (
    <SpaceTabsWrapper owner={owner} spaceId={spaceId}>
      <div className="flex w-full flex-col gap-4 p-4">
        <div className="heading-lg">Tools</div>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Tools tab content coming soon...
        </p>
      </div>
    </SpaceTabsWrapper>
  );
}

SpaceTools.getLayout = (
  page: ReactElement,
  pageProps: ConversationLayoutProps
) => {
  return (
    <AppRootLayout>
      <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>
    </AppRootLayout>
  );
};
