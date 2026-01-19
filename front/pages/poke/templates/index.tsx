import type { ReactElement } from "react";

import { TemplatesListPage } from "@app/components/poke/pages/TemplatesListPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function ListTemplates() {
  return <TemplatesListPage />;
}

ListTemplates.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Templates">{page}</PokeLayout>;
};
