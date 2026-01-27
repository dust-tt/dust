import type { ReactElement } from "react";

import { TriggerDetailsPage } from "@app/components/poke/pages/TriggerDetailsPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import type { PageWithLayout } from "@app/lib/auth/pokeServerSideProps";
import { pokeGetServerSideProps } from "@app/lib/auth/pokeServerSideProps";

export const getServerSideProps = pokeGetServerSideProps;

const Page = TriggerDetailsPage as PageWithLayout;

Page.getLayout = (page: ReactElement, pageProps: AuthContextValue) => {
  return (
    <PokeLayout
      title={`${pageProps.workspace?.name ?? "Workspace"} - Trigger`}
      authContext={pageProps}
    >
      {page}
    </PokeLayout>
  );
};

export default Page;
