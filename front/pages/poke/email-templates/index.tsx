import type { ReactElement } from "react";

import { EmailTemplatesPage } from "@app/components/poke/pages/EmailTemplatesPage";
import { PokeLayoutNoWorkspace } from "@app/components/poke/PokeLayout";
import type { AuthContextNoWorkspaceValue } from "@app/lib/auth/AuthContext";
import type { PageWithLayoutNoWorkspace } from "@app/lib/auth/pokeServerSideProps";
import { pokeGetServerSidePropsNoWorkspace } from "@app/lib/auth/pokeServerSideProps";

export const getServerSideProps = pokeGetServerSidePropsNoWorkspace;

const Page = EmailTemplatesPage as PageWithLayoutNoWorkspace;

Page.getLayout = (
  page: ReactElement,
  pageProps: AuthContextNoWorkspaceValue
) => {
  return (
    <PokeLayoutNoWorkspace title="Email Templates" authContext={pageProps}>
      {page}
    </PokeLayoutNoWorkspace>
  );
};

export default Page;
