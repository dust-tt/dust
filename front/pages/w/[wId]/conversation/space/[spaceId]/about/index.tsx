import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";
import React, { useState } from "react";

import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import { ConversationLayout } from "@app/components/assistant/conversation/ConversationLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useActiveSpaceId } from "@app/hooks/useActiveSpaceId";

import { getSpaceServerSideProps } from "../getServerSideProps";
import { SpaceTabsWrapper } from "../SpaceDetailsWrapper";
import { UserType } from "@app/types";

export const getServerSideProps = getSpaceServerSideProps;

export default function SpaceAbout({
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [selectedMembers, setSelectedMembers] = useState<UserType[]>([]);

  return (
    <SpaceTabsWrapper owner={owner}>
      <div className="flex w-full flex-col gap-4 p-4">
        <div className="heading-lg">About this project</div>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Project information coming soon...
        </p>
      </div>
    </SpaceTabsWrapper>
  );
}

SpaceAbout.getLayout = (
  page: ReactElement,
  pageProps: ConversationLayoutProps
) => {
  return (
    <AppRootLayout>
      <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>
    </AppRootLayout>
  );
};
