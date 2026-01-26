import type { ReactElement } from "react";

import { TemplatesListPage } from "@app/components/poke/pages/TemplatesListPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type { PageWithLayout } from "@app/lib/poke/common";
import { pokeGetServerSidePropsNoWorkspace } from "@app/lib/poke/common";

export const getServerSideProps = pokeGetServerSidePropsNoWorkspace;

const Page = TemplatesListPage as PageWithLayout;

Page.getLayout = (page: ReactElement, pageProps: AuthContextValue) => {
  return (
    <PokeLayout title="Templates" authContext={pageProps}>
      {page}
    </PokeLayout>
  );
};

export default Page;
