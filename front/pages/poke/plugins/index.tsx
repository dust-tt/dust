import type { ReactElement } from "react";

import { PluginsPage } from "@app/components/poke/pages/PluginsPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function PluginsPageNextJS() {
  return <PluginsPage />;
}

PluginsPageNextJS.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Plugins">{page}</PokeLayout>;
};
