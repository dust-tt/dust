import type { ReactElement } from "react";

import { PokefyPage } from "@app/components/poke/pages/PokefyPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements(async () => {
  return { props: {} };
});

export default function PokefyPageNextJS() {
  return <PokefyPage />;
}

PokefyPageNextJS.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Pokefy">{page}</PokeLayout>;
};
