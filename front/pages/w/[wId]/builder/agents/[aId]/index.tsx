import { EditAgentPage } from "@app/components/pages/builder/agents/EditAgentPage";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { ReactElement } from "react";

export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = EditAgentPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
