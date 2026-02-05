import type { ReactElement } from "react";

import { SpaceAppsListPage } from "@app/components/pages/spaces/SpaceAppsListPage";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";

export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = SpaceAppsListPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>
      <SpaceLayout>{page}</SpaceLayout>
    </AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
