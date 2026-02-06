import type { ReactElement } from "react";

import { AdminLayout } from "@app/components/layouts/AdminLayout";
import { APIKeysPage } from "@app/components/pages/workspace/developers/APIKeysPage";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsForAdmin } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";

export const getServerSideProps = appGetServerSidePropsForAdmin;

const PageWithAuthLayout = APIKeysPage as AppPageWithLayout;

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
