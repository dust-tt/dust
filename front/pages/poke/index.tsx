import type { ReactElement } from "react";

import { DashboardPage } from "@app/components/poke/pages/DashboardPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function DashboardPageNextJS() {
  return <DashboardPage />;
}

DashboardPageNextJS.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Home">{page}</PokeLayout>;
};
