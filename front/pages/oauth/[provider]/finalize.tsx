import type { ReactElement } from "react";

import { OAuthFinalizePage } from "@app/components/pages/oauth/OAuthFinalizePage";
import { AppAuthContextUserOnlyLayout } from "@app/components/sparkle/AppAuthContextUserOnlyLayout";
import type { AppPageWithLayoutUserOnly } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsUserOnly } from "@app/lib/auth/appServerSideProps";
import type { AuthContextUserOnlyValue } from "@app/lib/auth/AuthContext";

// This endpoint is authenticated but cannot be workspace specific as it is hard-coded at each
// provider as our callback URI.
export const getServerSideProps = appGetServerSidePropsUserOnly;

const PageWithAuthLayout = OAuthFinalizePage as AppPageWithLayoutUserOnly;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextUserOnlyValue
) => {
  return (
    <AppAuthContextUserOnlyLayout authContext={pageProps}>
      {page}
    </AppAuthContextUserOnlyLayout>
  );
};

export default PageWithAuthLayout;
