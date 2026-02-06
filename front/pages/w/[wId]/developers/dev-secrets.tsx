import type { ReactElement } from "react";

import { AdminLayout } from "@app/components/layouts/AdminLayout";
import { SecretsPage } from "@app/components/pages/workspace/developers/SecretsPage";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsForBuilders } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";

export const getServerSideProps = appGetServerSidePropsForBuilders;

const PageWithAuthLayout = SecretsPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>
      <AdminLayout>{page}</AdminLayout>
    </AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
