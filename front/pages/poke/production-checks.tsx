import type { ReactElement } from "react";

import { ProductionChecksPage } from "@app/components/poke/pages/ProductionChecksPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function ProductionChecksPageNextJS() {
  return <ProductionChecksPage />;
}

ProductionChecksPageNextJS.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Production Checks">{page}</PokeLayout>;
};
