import type { ReactElement } from "react";

import { PlansPage } from "@app/components/poke/pages/PlansPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function Plans() {
  return <PlansPage />;
}

Plans.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Plans">{page}</PokeLayout>;
};
