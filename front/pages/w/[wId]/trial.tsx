import type { ReactElement } from "react";

import { TrialPage } from "@app/components/pages/onboarding/TrialPage";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsPaywallWhitelistedForAdmin } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";

export const getServerSideProps =
  appGetServerSidePropsPaywallWhitelistedForAdmin;

const PageWithAuthLayout = TrialPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
