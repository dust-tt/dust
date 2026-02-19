import { ManageSubscriptionPage } from "@app/components/pages/workspace/subscription/ManageSubscriptionPage";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsForAdmin } from "@app/lib/auth/appServerSideProps";
import type { ReactElement } from "react";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSidePropsForAdmin;

const PageWithAuthLayout = ManageSubscriptionPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
