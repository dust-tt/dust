import type { ReactElement } from "react";

import { KillPage } from "@app/components/poke/pages/KillPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function Kill() {
  return <KillPage />;
}

Kill.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Kill Switches">{page}</PokeLayout>;
};
