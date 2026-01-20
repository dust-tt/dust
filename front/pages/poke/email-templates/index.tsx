import type { ReactElement } from "react";

import { EmailTemplatesPage } from "@app/components/poke/pages/EmailTemplatesPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function EmailTemplatesPageNextJS() {
  return <EmailTemplatesPage />;
}

EmailTemplatesPageNextJS.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Email Templates">{page}</PokeLayout>;
};
