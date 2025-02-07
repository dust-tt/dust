import type { ReactElement } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { TemplatesDataTable } from "@app/components/poke/templates/TemplatesDataTable";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function ListTemplates() {
  return (
    <div className="mx-auto h-full flex-grow flex-col items-center justify-center p-8 pt-8">
      <TemplatesDataTable />
    </div>
  );
}

ListTemplates.getLayout = (page: ReactElement) => {
  return <PokeLayout>{page}</PokeLayout>;
};
