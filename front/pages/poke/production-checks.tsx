import type { ReactElement } from "react";

import { ProductionChecksPage } from "@app/components/poke/pages/ProductionChecksPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type { PageWithLayout } from "@app/lib/poke/common";
import { pokeGetServerSidePropsNoWorkspace } from "@app/lib/poke/common";

export const getServerSideProps = pokeGetServerSidePropsNoWorkspace;

const Page = ProductionChecksPage as PageWithLayout;

Page.getLayout = (page: ReactElement, pageProps: AuthContextValue) => {
  return (
    <PokeLayout title="Production Checks" authContext={pageProps}>
      {page}
    </PokeLayout>
  );
};

export default Page;
