import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { TemplateDetailPage } from "@app/components/poke/pages/TemplateDetailPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

export default function TemplatesPage() {
  const router = useRouter();
  const templateId =
    typeof router.query.tId === "string" ? router.query.tId : null;

  if (!templateId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-primary-50 dark:bg-primary-50-night">
        <div className="text-primary-900">Loading...</div>
      </div>
    );
  }

  return <TemplateDetailPage templateId={templateId} />;
}

TemplatesPage.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Template">{page}</PokeLayout>;
};
