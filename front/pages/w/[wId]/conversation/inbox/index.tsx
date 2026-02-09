import type { ReactElement } from "react";

import { ConversationLayout } from "@app/components/assistant/conversation/ConversationLayout";
import { InboxPage } from "@app/components/pages/conversation/InboxPage";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";

export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = InboxPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>
      <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>
    </AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
