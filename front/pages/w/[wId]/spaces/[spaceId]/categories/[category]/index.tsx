import type { ReactElement } from "react";

import { SpaceCategoryPage } from "@app/components/pages/spaces/SpaceCategoryPage";
import { SpaceLayout } from "@app/components/spaces/SpaceLayout";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";

export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = SpaceCategoryPage as AppPageWithLayout;

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
