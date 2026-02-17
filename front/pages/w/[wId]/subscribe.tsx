import { SubscribePage } from "@app/components/pages/onboarding/SubscribePage";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsPaywallWhitelisted } from "@app/lib/auth/appServerSideProps";
import type { ReactElement } from "react";

export const getServerSideProps = appGetServerSidePropsPaywallWhitelisted;

const PageWithAuthLayout = SubscribePage as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
