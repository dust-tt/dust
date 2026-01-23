import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { TemplateDetailPage } from "@app/components/poke/pages/TemplateDetailPage";
import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  templateId: string;
}>(async (context) => {
  const { tId } = context.params ?? {};
  if (!isString(tId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      templateId: tId,
    },
  };
});

export default function TemplateDetailPageNextJS({
  templateId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <TemplateDetailPage templateId={templateId} />;
}

TemplateDetailPageNextJS.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Template">{page}</PokeLayout>;
};
