import type { ReactElement } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { TemplatesDataTable } from "@app/components/poke/templates/TemplatesDataTable";
import { config } from "@app/lib/api/regions/config";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    const dustRegionSyncEnabled = config.getDustRegionSyncEnabled();
    return {
      props: {
        dustRegionSyncEnabled,
      },
    };
  }
);

export default function ListTemplates({
  dustRegionSyncEnabled,
}: {
  dustRegionSyncEnabled: boolean;
}) {
  return (
    <div className="mx-auto h-full flex-grow flex-col items-center justify-center p-8 pt-8">
      <TemplatesDataTable dustRegionSyncEnabled={dustRegionSyncEnabled} />
    </div>
  );
}

ListTemplates.getLayout = (page: ReactElement) => {
  return <PokeLayout>{page}</PokeLayout>;
};
